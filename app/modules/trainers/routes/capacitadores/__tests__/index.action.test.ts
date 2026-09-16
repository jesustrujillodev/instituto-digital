import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { TRAINER_INTENTS } from "../../../utils/parse-trainer-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const USER_ID = "11111111-1111-4111-8111-111111111111";

const requestOf = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	return new Request("https://app.example.com/dashboard/capacitadores", {
		method: "POST",
		body,
	});
};

const createHarness = (
	options: { role?: Role | null; failsWith?: string } = {},
) => {
	const calls = {
		activated: [] as unknown[],
		deactivated: [] as string[],
		reactivated: [] as string[],
	};

	const reply = () =>
		options.failsWith
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
			activateProfile: async (dto: unknown) => {
				calls.activated.push(dto);
				return reply();
			},
			deactivateProfile: async (documentId: string) => {
				calls.deactivated.push(documentId);
				return reply();
			},
			reactivateProfile: async (documentId: string) => {
				calls.reactivated.push(documentId);
				return reply();
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

describe("capacitadores action — guard", () => {
	// Mirar el catálogo lo puede hacer cualquier capacitador; modificarlo no. El
	// guard del action es POR ROL, a diferencia del loader.
	test("un capacitador sin rol de gestión recibe 403", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(
			requestOf({
				userDocumentId: USER_ID,
				specialty: "Protección civil",
				intent: TRAINER_INTENTS.activate,
			}),
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.activated).toEqual([]);
	});

	test("un guard fallido no llega al servicio", async () => {
		const { context, calls } = createHarness({ role: null });

		await run(
			requestOf({
				userDocumentId: USER_ID,
				intent: TRAINER_INTENTS.deactivate,
			}),
			context,
		).catch(() => null);

		expect(calls.deactivated).toEqual([]);
	});
});

describe("capacitadores action — intenciones", () => {
	test("activa el perfil con los datos del formulario", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			requestOf({
				userDocumentId: USER_ID,
				specialty: "Protección civil",
				intent: TRAINER_INTENTS.activate,
			}),
			context,
		);

		expect(result.success).toBe(true);
		expect(calls.activated).toEqual([
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
		]);
	});

	test("desactiva y reactiva por el documentId de la cuenta", async () => {
		const { context, calls } = createHarness();

		await run(
			requestOf({
				userDocumentId: USER_ID,
				intent: TRAINER_INTENTS.deactivate,
			}),
			context,
		);
		await run(
			requestOf({
				userDocumentId: USER_ID,
				intent: TRAINER_INTENTS.reactivate,
			}),
			context,
		);

		expect(calls.deactivated).toEqual([USER_ID]);
		expect(calls.reactivated).toEqual([USER_ID]);
	});

	test("una intención desconocida se rechaza como validación", async () => {
		const { context } = createHarness();

		const result = await run(
			requestOf({ userDocumentId: USER_ID, intent: "borrar-todo" }),
			context,
		);

		expect(result.success).toBe(false);
		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
	});

	test("un documentId que no es uuid no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			requestOf({
				userDocumentId: "no-es-uuid",
				intent: TRAINER_INTENTS.deactivate,
			}),
			context,
		);

		expect(result.success).toBe(false);
		expect(calls.deactivated).toEqual([]);
	});
});

describe("capacitadores action — fallos del servicio", () => {
	// Un action no corta con un status: responde el envelope para que la pantalla
	// siga en pie y pueda mostrar el error donde toca.
	test("devuelve la copia del módulo sin exponer el mensaje técnico", async () => {
		const { context } = createHarness({
			failsWith: "TRAINER_PROFILE_ALREADY_EXISTS",
		});

		const result = await run(
			requestOf({
				userDocumentId: USER_ID,
				specialty: "Protección civil",
				intent: TRAINER_INTENTS.activate,
			}),
			context,
		);

		expect(result.success).toBe(false);
		expect(!result.success && result.error.message).toBe(
			"Esa persona ya tiene perfil de capacitador.",
		);
	});
});
