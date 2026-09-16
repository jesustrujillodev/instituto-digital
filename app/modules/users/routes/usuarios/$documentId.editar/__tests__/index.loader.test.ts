import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import type { SafeUser } from "../../../../domain/user.types";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST = new Request(
	`https://app.example.com/usuarios/${DOCUMENT_ID}/editar`,
);

const user = { documentId: DOCUMENT_ID, email: "ana@empresa.com" } as SafeUser;

const createHarness = (
	options: { role?: Role | null; findFails?: string } = {},
) => {
	const calls = { findById: [] as string[] };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: DOCUMENT_ID,
						userId: 7,
						email: "ana@empresa.com",
						role: options.role ?? "ADMIN",
						dependencyId: null,
						iat: 1_800_000_000,
					},
		userService: {
			// La bitácora es informativa: el loader la pide en paralelo y sigue
			// sirviendo la pantalla aunque falle.
			listDependencyHistory: async () => ({
				success: true as const,
				data: [],
				timestamp: new Date().toISOString(),
			}),
			findById: async (id: string) => {
				calls.findById.push(id);
				if (options.findFails) {
					return {
						success: false as const,
						error: { code: options.findFails, message: "técnico" },
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data: user,
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], documentId = DOCUMENT_ID) =>
	loader({
		request: REQUEST,
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("usuarios/editar loader", () => {
	test("devuelve el usuario dentro del envelope", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(result.success).toBe(true);
		expect(result.data.user.documentId).toBe(DOCUMENT_ID);
		expect(calls.findById).toEqual([DOCUMENT_ID]);
	});

	test("corta con 403 para un rol insuficiente sin consultar nada", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.findById).toEqual([]);
	});

	// Un documentId con formato inválido y un usuario inexistente terminan igual:
	// un status del diccionario del módulo. Antes esta ruta respondía 404 en el
	// loader y un fieldError en el action ante la MISMA URL malformada.
	test("un documentId malformado corta con 400 sin llegar al servicio", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(context, "no-es-uuid").catch((e) => e);

		expect(thrown.init.status).toBe(400);
		expect(thrown.data.code).toBe("VALIDATION_ERROR");
		expect(calls.findById).toEqual([]);
	});

	test("un usuario inexistente corta con 404", async () => {
		const { context } = createHarness({ findFails: "USER_NOT_FOUND" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
		expect(thrown.data.code).toBe("USER_NOT_FOUND");
		expect(thrown.data.message).toBe("El usuario ya no existe.");
	});

	test("un fallo desconocido corta con 500 sin exponer su mensaje", async () => {
		const { context } = createHarness({ findFails: "UNEXPECTED_ERROR" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
		expect(thrown.data.message).not.toBe("técnico");
	});
});
