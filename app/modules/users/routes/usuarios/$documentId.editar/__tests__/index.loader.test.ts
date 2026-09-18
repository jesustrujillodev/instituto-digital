import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import type { SafeUser } from "../../../../domain/user.types";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST = new Request(
	`https://app.example.com/usuarios/${DOCUMENT_ID}/editar`,
);

const okOf = <T>(data: T) => ({
	success: true as const,
	data,
	timestamp: new Date().toISOString(),
});

const userOf = (overrides: Partial<SafeUser> = {}) =>
	({
		id: 9,
		documentId: DOCUMENT_ID,
		email: "ana@empresa.com",
		role: "USER",
		type: "INTERNAL",
		dependencyId: 3,
		...overrides,
	}) as SafeUser;

const createHarness = (
	options: {
		role?: Role | null;
		actorDependencyId?: number | null;
		user?: SafeUser;
		findFails?: string;
	} = {},
) => {
	const calls = { findById: [] as string[], catalog: 0 };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "99999999-9999-4999-8999-999999999999",
						userId: 7,
						email: "admin@empresa.com",
						role: options.role ?? "SUPERADMIN",
						dependencyId: options.actorDependencyId ?? null,
						iat: 1_800_000_000,
					},
		userService: {
			// La bitácora es informativa: el loader la pide en paralelo y sigue
			// sirviendo la pantalla aunque falle.
			listDependencyHistory: async () => okOf([]),
			findById: async (id: string) => {
				calls.findById.push(id);
				if (options.findFails) {
					return {
						success: false as const,
						error: { code: options.findFails, message: "técnico" },
						timestamp: new Date().toISOString(),
					};
				}
				return okOf(options.user ?? userOf());
			},
		},
		dependencyService: {
			findByInternalId: async (id: number) => {
				calls.catalog += 1;
				return okOf({ id, name: "Obras Públicas" });
			},
			listActive: async () => {
				calls.catalog += 1;
				return okOf([
					{ id: 3, documentId: "dep-3", name: "Obras Públicas" },
					{ id: 5, documentId: "dep-5", name: "Desarrollo Social" },
				]);
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

describe("usuarios/editar loader — traslado de dependencia", () => {
	test("al superadministrador le ofrece las demás dependencias activas", async () => {
		const { context } = createHarness({ role: "SUPERADMIN" });

		const result = await run(context);

		expect(result.data.dependencyChange).toEqual({
			kind: "available",
			currentName: "Obras Públicas",
			options: [{ documentId: "dep-5", name: "Desarrollo Social" }],
		});
	});

	test("al titular se lo ofrece sobre un participante de su dependencia", async () => {
		const { context } = createHarness({
			role: "DEPENDENCY_HEAD",
			actorDependencyId: 3,
		});

		const result = await run(context);

		expect(result.data.dependencyChange?.kind).toBe("available");
	});

	// Se explica el motivo en vez de esconder el control, y sin cargar un
	// catálogo que no se va a usar.
	test("sobre un titular explica que no se puede, sin consultar el catálogo", async () => {
		const { context, calls } = createHarness({
			role: "SUPERADMIN",
			user: userOf({ role: "DEPENDENCY_HEAD" }),
		});

		const result = await run(context);

		expect(result.data.dependencyChange).toEqual({ kind: "head" });
		expect(calls.catalog).toBe(0);
	});

	test("sin permiso para trasladar no ofrece nada", async () => {
		const { context, calls } = createHarness({
			role: "DEPENDENCY_HEAD",
			actorDependencyId: 8,
		});

		const result = await run(context);

		expect(result.data.dependencyChange).toBeNull();
		expect(calls.catalog).toBe(0);
	});

	test("nadie se traslada a sí mismo desde aquí", async () => {
		const { context } = createHarness({
			role: "SUPERADMIN",
			user: userOf({ id: 7 }),
		});

		const result = await run(context);

		expect(result.data.dependencyChange).toBeNull();
	});
});
