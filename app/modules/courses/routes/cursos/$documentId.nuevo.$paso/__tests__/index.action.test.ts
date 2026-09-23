import { describe, expect, test } from "vitest";
import {
	COURSE_INTENTS,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../../../../utils/parse-course-form-data";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	failReply,
	okReply,
	postRequest,
} from "../../__tests__/route-harness";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

/** Lo que manda el paso 1: el resto del curso todavía está vacío. */
const stepOnePayload = {
	title: "Ofimática básica",
	modality: "IN_PERSON",
	access: "PUBLIC",
	trainers: [],
	sessions: [],
};

const createHarness = (
	options: ActorOptions & {
		updateFailsWith?: string;
		publishFailsWith?: string;
	} = {},
) => {
	const calls = {
		updated: [] as unknown[],
		published: [] as unknown[],
	};

	const context = {
		authPayload: authPayloadOf(options),
		courseService: {
			update: async (documentId: string, dto: unknown) => {
				calls.updated.push({ documentId, dto });
				return options.updateFailsWith
					? failReply(options.updateFailsWith)
					: okReply(null);
			},
			publish: async (documentId: string) => {
				calls.published.push({ documentId });
				return options.publishFailsWith
					? failReply(options.publishFailsWith)
					: okReply(null);
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (
	fields: Record<string, string>,
	context: ActionArgs["context"],
	{ documentId = COURSE_ID, paso = "2" } = {},
) =>
	action({
		request: postRequest(
			`/dashboard/cursos/${documentId}/nuevo/${paso}`,
			fields,
		),
		context,
		params: { documentId, paso },
	} as unknown as ActionArgs);

const updateFields = (payload: unknown = stepOnePayload) => ({
	[INTENT_FIELD]: COURSE_INTENTS.update,
	[PAYLOAD_FIELD]: JSON.stringify(payload),
});

describe("cursos/alta action · guardar el paso", () => {
	test("guarda con el documentId de la URL", async () => {
		const { context, calls } = createHarness({ role: "USER", isTrainer: true });

		const result = await run(updateFields(), context);

		expect(result.success).toBe(true);
		expect(calls.updated).toMatchObject([{ documentId: COURSE_ID }]);
	});

	// Es lo que permite guardar el paso 1 antes de programar nada: la exigencia
	// de sesiones y capacitadores es de publicar, no de guardar.
	test("un curso sin sesiones ni capacitadores se guarda igual", async () => {
		const { context, calls } = createHarness();

		const result = await run(updateFields(), context);

		expect(result.success).toBe(true);
		expect(calls.updated).toMatchObject([
			{ dto: { sessions: [], trainers: [] } },
		]);
	});

	test("un parámetro de URL que no es uuid no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(updateFields(), context, { documentId: "42" });

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.updated).toEqual([]);
	});

	test("un payload sin título no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			updateFields({ ...stepOnePayload, title: "" }),
			context,
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.updated).toEqual([]);
	});

	test("las horas del paso 1 llegan al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			updateFields({ ...stepOnePayload, hours: 20 }),
			context,
			{ paso: "1" },
		);

		expect(result.success).toBe(true);
		expect(calls.updated).toMatchObject([{ dto: { hours: 20 } }]);
	});

	test("unas horas fuera de rango no llegan al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			updateFields({ ...stepOnePayload, hours: 501 }),
			context,
			{ paso: "1" },
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.updated).toEqual([]);
	});

	test("un curso que ya no se edita vuelve con su copia", async () => {
		const { context } = createHarness({
			updateFailsWith: "COURSE_NOT_EDITABLE",
		});

		const result = await run(updateFields(), context);

		expect(!result.success && result.error.message).toBe(
			"Un curso finalizado o cancelado ya no se puede modificar.",
		);
	});
});

describe("cursos/alta action · publicar", () => {
	test("el último paso publica el curso de la URL", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{ [INTENT_FIELD]: COURSE_INTENTS.publish },
			context,
			{ paso: "5" },
		);

		expect(result.success).toBe(true);
		expect(calls.published).toMatchObject([{ documentId: COURSE_ID }]);
		expect(calls.updated).toEqual([]);
	});

	test("un curso sin sesiones no se publica", async () => {
		const { context } = createHarness({
			publishFailsWith: "COURSE_SESSIONS_REQUIRED",
		});

		const result = await run(
			{ [INTENT_FIELD]: COURSE_INTENTS.publish },
			context,
			{ paso: "5" },
		);

		expect(result.success).toBe(false);
	});
});

describe("cursos/alta action · intents", () => {
	test.each([COURSE_INTENTS.create, COURSE_INTENTS.cancel, "borrar"])(
		"%s no es una acción del alta",
		async (intent) => {
			const { context, calls } = createHarness();

			const result = await run(
				{
					[INTENT_FIELD]: intent,
					[PAYLOAD_FIELD]: JSON.stringify(stepOnePayload),
				},
				context,
			);

			expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
			expect(calls.updated).toEqual([]);
			expect(calls.published).toEqual([]);
		},
	);
});
