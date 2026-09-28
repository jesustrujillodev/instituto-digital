import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { TRAINER_INTENTS } from "../../../../../utils/parse-trainer-form-data";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const USER_ID = "11111111-1111-4111-8111-111111111111";

const createHarness = (
	options: { role?: Role | null; failsWith?: string } = {},
) => {
	const calls = {
		activated: [] as unknown[],
		updated: [] as unknown[],
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
			updateProfile: async (documentId: string, dto: unknown) => {
				calls.updated.push({ documentId, dto });
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

const run = (
	fields: Record<string, string>,
	context: ActionArgs["context"],
	documentId = USER_ID,
) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	return action({
		request: new Request(
			`https://app.example.com/dashboard/usuarios/${documentId}/perfil-capacitador`,
			{ method: "POST", body },
		),
		context,
		params: { documentId },
	} as unknown as ActionArgs);
};

describe("perfil de capacitador — guard", () => {
	test("un capacitador sin rol de gestión recibe 403", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(
			{ specialty: "Protección civil", intent: TRAINER_INTENTS.activate },
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.activated).toEqual([]);
	});

	test("sin sesión no llega al servicio", async () => {
		const { context, calls } = createHarness({ role: null });

		await run({ intent: TRAINER_INTENTS.deactivate }, context).catch(
			() => null,
		);

		expect(calls.deactivated).toEqual([]);
	});

	test("un documentId que no es uuid no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{ intent: TRAINER_INTENTS.deactivate },
			context,
			"no-es-uuid",
		);

		expect(result.success).toBe(false);
		expect(calls.deactivated).toEqual([]);
	});
});

describe("perfil de capacitador — intenciones", () => {
	test("habilita con la cuenta de la URL y los datos del formulario", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{ specialty: "Protección civil", intent: TRAINER_INTENTS.activate },
			context,
		);

		expect(result.success).toBe(true);
		expect(calls.activated).toEqual([
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
		]);
	});

	// La cuenta sale de la URL: un campo del formulario no puede cambiar a quién
	// se le habilita el perfil.
	test("ignora un userDocumentId enviado en el formulario", async () => {
		const { context, calls } = createHarness();

		await run(
			{
				userDocumentId: "22222222-2222-4222-8222-222222222222",
				specialty: "Protección civil",
				intent: TRAINER_INTENTS.activate,
			},
			context,
		);

		expect(calls.activated).toEqual([
			{ userDocumentId: USER_ID, specialty: "Protección civil" },
		]);
	});

	test("habilitar sin especialidad no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run({ intent: TRAINER_INTENTS.activate }, context);

		expect(result.success).toBe(false);
		expect(calls.activated).toEqual([]);
	});

	test("edita el perfil de la cuenta de la URL", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{
				specialty: "Primeros auxilios",
				bio: "Diez años en campo.",
				intent: TRAINER_INTENTS.update,
			},
			context,
		);

		expect(result.success).toBe(true);
		expect(calls.updated).toEqual([
			{
				documentId: USER_ID,
				dto: { specialty: "Primeros auxilios", bio: "Diez años en campo." },
			},
		]);
	});

	test("una semblanza vaciada se envía como null para borrarla", async () => {
		const { context, calls } = createHarness();

		await run(
			{
				specialty: "Primeros auxilios",
				bio: "",
				intent: TRAINER_INTENTS.update,
			},
			context,
		);

		expect(calls.updated).toEqual([
			{
				documentId: USER_ID,
				dto: { specialty: "Primeros auxilios", bio: null },
			},
		]);
	});

	test("deshabilita y vuelve a habilitar por la cuenta de la URL", async () => {
		const { context, calls } = createHarness();

		await run({ intent: TRAINER_INTENTS.deactivate }, context);
		await run({ intent: TRAINER_INTENTS.reactivate }, context);

		expect(calls.deactivated).toEqual([USER_ID]);
		expect(calls.reactivated).toEqual([USER_ID]);
	});

	test("una intención desconocida se rechaza como validación", async () => {
		const { context } = createHarness();

		const result = await run({ intent: "borrar-todo" }, context);

		expect(result.success).toBe(false);
		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
	});
});

describe("perfil de capacitador — fallos del servicio", () => {
	// Un action no corta con un status: responde el envelope para que la pantalla
	// siga en pie y pueda mostrar el error donde toca.
	test("devuelve la copia del módulo sin exponer el mensaje técnico", async () => {
		const { context } = createHarness({
			failsWith: "TRAINER_PROFILE_ALREADY_EXISTS",
		});

		const result = await run(
			{ specialty: "Protección civil", intent: TRAINER_INTENTS.activate },
			context,
		);

		expect(result.success).toBe(false);
		expect(!result.success && result.error.message).toBe(
			"Esa persona ya tiene perfil de capacitador.",
		);
	});

	test("la incoherencia de institución vuelve marcando su campo", async () => {
		const { context } = createHarness({
			failsWith: "INTERNAL_TRAINER_CANNOT_HAVE_INSTITUTION",
		});

		const result = await run(
			{
				specialty: "Protección civil",
				institution: "Universidad",
				intent: TRAINER_INTENTS.update,
			},
			context,
		);

		expect(!result.success && result.error.fieldErrors).toEqual({
			institution: "No aplica para personal interno",
		});
	});
});
