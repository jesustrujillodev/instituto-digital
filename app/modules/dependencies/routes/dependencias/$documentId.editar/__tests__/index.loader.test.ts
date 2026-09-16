import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

const REQUEST = new Request(
	`https://app.example.com/dashboard/dependencias/${DOCUMENT_ID}/editar`,
);

const okOf = <T>(data: T) => ({
	success: true as const,
	data,
	timestamp: new Date().toISOString(),
});

const failOf = (code: string) => ({
	success: false as const,
	error: { code, message: "técnico" },
	timestamp: new Date().toISOString(),
});

const createHarness = (
	options: {
		role?: Role | null;
		findFails?: string;
		candidatesFail?: string;
	} = {},
) => {
	const calls = { findById: [] as string[], candidates: [] as string[] };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "99999999-9999-4999-8999-999999999999",
						userId: 7,
						email: "ana@instituto.gob.mx",
						role: options.role ?? "SUPERADMIN",
						dependencyId: null,
						iat: 1_800_000_000,
					},
		dependencyService: {
			findById: async (documentId: string) => {
				calls.findById.push(documentId);
				return options.findFails
					? failOf(options.findFails)
					: okOf({ documentId, name: "Obras Públicas", archivedAt: null });
			},
			listHeadCandidates: async (documentId: string) => {
				calls.candidates.push(documentId);
				return options.candidatesFail
					? failOf(options.candidatesFail)
					: okOf([]);
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

describe("editar dependencia loader — guard", () => {
	test("cualquier rol salvo SUPERADMIN recibe 403", async () => {
		for (const role of [
			"USER",
			"ADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			const { context, calls } = createHarness({ role });
			const thrown = await run(context).catch((e) => e);

			expect(thrown.init.status).toBe(403);
			expect(calls.findById).toEqual([]);
		}
	});

	test("sin sesión redirige a login", async () => {
		const { context } = createHarness({ role: null });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});
});

describe("editar dependencia loader — datos", () => {
	test("devuelve la dependencia y sus candidatos a titular", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.dependency.documentId).toBe(DOCUMENT_ID);
			expect(result.data.candidates).toEqual([]);
		}
		expect(calls.findById).toEqual([DOCUMENT_ID]);
		expect(calls.candidates).toEqual([DOCUMENT_ID]);
	});

	// La validación de frontera también aplica al parámetro de la URL: un
	// documentId que no es uuid no debe llegar al servicio.
	test("un documentId que no es uuid corta antes del servicio", async () => {
		const { context, calls } = createHarness();

		await expect(run(context, "5")).rejects.toThrow();
		expect(calls.findById).toEqual([]);
	});

	test("una dependencia inexistente corta con 404", async () => {
		const { context } = createHarness({ findFails: "DEPENDENCY_NOT_FOUND" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
		expect(thrown.data.message).toBe("La dependencia ya no existe.");
	});

	// Las dos consultas son independientes pero la pantalla necesita ambas: si el
	// catálogo falla, mostrar la dependencia sin candidatos haría creer que no
	// tiene personal.
	test("un fallo al listar candidatos también corta", async () => {
		const { context } = createHarness({ candidatesFail: "UNEXPECTED_ERROR" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
		expect(thrown.data.message).not.toBe("técnico");
	});
});
