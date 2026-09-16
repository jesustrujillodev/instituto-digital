import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const VALID = {
	firstName: "Luis",
	lastName: "Mora",
	email: "luis@universidad.mx",
	password: "Password123!",
	specialty: "Transparencia",
	institution: "Universidad Autónoma",
};

const requestOf = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	return new Request("https://app.example.com/dashboard/capacitadores/nuevo", {
		method: "POST",
		body,
	});
};

const createHarness = (
	options: { role?: Role | null; failsWith?: string } = {},
) => {
	const calls = { created: [] as unknown[], actors: [] as unknown[] };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "99999999-9999-4999-8999-999999999999",
						userId: 7,
						email: "titular@instituto.gob.mx",
						role: options.role ?? "DEPENDENCY_DEPUTY",
						dependencyId: 3,
						isTrainer: false,
						iat: 1_800_000_000,
					},
		trainerService: {
			createExternal: async (dto: unknown, actor: unknown) => {
				calls.created.push(dto);
				calls.actors.push(actor);
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

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

describe("nuevo capacitador externo — guard", () => {
	test("un participante recibe 403 sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(requestOf(VALID), context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.created).toEqual([]);
	});
});

describe("nuevo capacitador externo — alta", () => {
	test("pasa el dto validado y el actor al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(requestOf(VALID), context);

		expect(result.success).toBe(true);
		expect(calls.created[0]).toMatchObject({
			email: "luis@universidad.mx",
			institution: "Universidad Autónoma",
		});
		expect(calls.actors[0]).toMatchObject({ role: "DEPENDENCY_DEPUTY" });
	});

	// Es lo que sitúa al externo: sin dependencia ni número de empleado, la
	// institución es su única procedencia.
	test("sin institución no llega al servicio", async () => {
		const { institution: _, ...sinInstitucion } = VALID;
		const { context, calls } = createHarness();

		const result = await run(requestOf(sinInstitucion), context);

		expect(result.success).toBe(false);
		expect(calls.created).toEqual([]);
	});

	test("el correo duplicado vuelve marcando su campo", async () => {
		const { context } = createHarness({
			failsWith: "DUPLICATE_TRAINER_EMAIL",
		});

		const result = await run(requestOf(VALID), context);

		expect(!result.success && result.error.fieldErrors).toEqual({
			email: "Ya existe una cuenta con ese correo",
		});
	});
});
