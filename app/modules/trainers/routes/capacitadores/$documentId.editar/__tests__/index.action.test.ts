import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const USER_ID = "11111111-1111-4111-8111-111111111111";

const createHarness = (
	options: { role?: Role | null; failsWith?: string } = {},
) => {
	const calls = { updates: [] as unknown[] };

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
			updateProfile: async (documentId: string, dto: unknown) => {
				calls.updates.push({ documentId, dto });
				return options.failsWith
					? {
							success: false as const,
							error: { code: options.failsWith, message: "técnico" },
							timestamp: new Date().toISOString(),
						}
					: {
							success: true as const,
							data: null,
							timestamp: new Date().toISOString(),
						};
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (
	fields: Record<string, string>,
	context: ActionArgs["context"],
	documentId = USER_ID,
) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	return action({
		request: new Request(
			`https://app.example.com/dashboard/capacitadores/${documentId}/editar`,
			{ method: "POST", body },
		),
		context,
		params: { documentId },
	} as unknown as ActionArgs);
};

describe("editar perfil — guard", () => {
	test("un capacitador sin rol de gestión recibe 403", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run({ specialty: "Primeros auxilios" }, context).catch(
			(e) => e,
		);

		expect(thrown.init.status).toBe(403);
		expect(calls.updates).toEqual([]);
	});
});

describe("editar perfil — edición", () => {
	test("toma el sujeto de la URL y los campos del formulario", async () => {
		const { context, calls } = createHarness();

		const result = await run({ specialty: "Primeros auxilios" }, context);

		expect(result.success).toBe(true);
		expect(calls.updates).toEqual([
			{ documentId: USER_ID, dto: { specialty: "Primeros auxilios" } },
		]);
	});

	test("un documentId que no es uuid no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{ specialty: "Primeros auxilios" },
			context,
			"no-es-uuid",
		);

		expect(result.success).toBe(false);
		expect(calls.updates).toEqual([]);
	});

	// La institución solo aplica a un externo; el error vuelve marcando su campo.
	test("la incoherencia de institución vuelve al campo", async () => {
		const { context } = createHarness({
			failsWith: "INTERNAL_TRAINER_CANNOT_HAVE_INSTITUTION",
		});

		const result = await run({ institution: "Universidad" }, context);

		expect(!result.success && result.error.fieldErrors).toEqual({
			institution: "No aplica para personal interno",
		});
	});
});
