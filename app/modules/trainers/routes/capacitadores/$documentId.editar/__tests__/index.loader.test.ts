import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const USER_ID = "11111111-1111-4111-8111-111111111111";

const createHarness = (
	options: { role?: Role | null; failsWith?: string } = {},
) => {
	const calls = { lookups: [] as string[] };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "99999999-9999-4999-8999-999999999999",
						userId: 7,
						email: "titular@instituto.gob.mx",
						role: options.role ?? "DEPENDENCY_HEAD",
						dependencyId: 3,
						isTrainer: false,
						iat: 1_800_000_000,
					},
		trainerService: {
			findByUser: async (documentId: string) => {
				calls.lookups.push(documentId);
				return options.failsWith
					? {
							success: false as const,
							error: { code: options.failsWith, message: "técnico" },
							timestamp: new Date().toISOString(),
						}
					: {
							success: true as const,
							data: { userDocumentId: documentId },
							timestamp: new Date().toISOString(),
						};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], documentId = USER_ID) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/capacitadores/${documentId}/editar`,
		),
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("ficha del capacitador — guard", () => {
	// Un capacitador puede VER el catálogo, pero la ficha es la pantalla de
	// edición: entra solo quien administra.
	test("un capacitador sin rol de gestión recibe 403", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.lookups).toEqual([]);
	});
});

describe("ficha del capacitador — carga", () => {
	test("valida el parámetro de la URL antes de consultar", async () => {
		const { context, calls } = createHarness();

		await expect(run(context, "no-es-uuid")).rejects.toThrow();
		expect(calls.lookups).toEqual([]);
	});

	test("devuelve la ficha en el envelope estándar", async () => {
		const { context } = createHarness();

		const result = await run(context);

		expect(result.success && result.data.trainer.userDocumentId).toBe(USER_ID);
	});

	test("una cuenta sin perfil corta con 404", async () => {
		const { context } = createHarness({
			failsWith: "TRAINER_PROFILE_NOT_FOUND",
		});

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
	});
});
