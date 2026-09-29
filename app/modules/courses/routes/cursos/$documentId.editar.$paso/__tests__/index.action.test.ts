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

const SAVED_SESSIONS = [
	{
		documentId: "44444444-4444-4444-8444-444444444444",
		startsAt: new Date("2026-10-05T16:00:00.000Z"),
	},
];

type ActionArgs = Parameters<typeof action>[0];

const validCourse = {
	title: "Ofimática básica",
	modality: "IN_PERSON",
	access: "PUBLIC",
	trainers: [],
	sessions: [],
};

const createHarness = (options: ActorOptions & { failsWith?: string } = {}) => {
	const calls = {
		updated: [] as unknown[],
	};
	const reply = () =>
		options.failsWith
			? failReply(options.failsWith)
			: okReply({ sessions: SAVED_SESSIONS });

	const context = {
		authPayload: authPayloadOf(options),
		courseService: {
			update: async (documentId: string, dto: unknown) => {
				calls.updated.push({ documentId, dto });
				return reply();
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (
	fields: Record<string, string>,
	context: ActionArgs["context"],
	documentId = COURSE_ID,
) =>
	action({
		request: postRequest(`/dashboard/cursos/${documentId}/editar/1`, fields),
		context,
		params: { documentId, paso: "1" },
	} as unknown as ActionArgs);

describe("cursos/edición action", () => {
	test("guarda con el documentId de la URL", async () => {
		const { context, calls } = createHarness({ role: "USER", isTrainer: true });

		const result = await run(
			{
				[INTENT_FIELD]: COURSE_INTENTS.update,
				[PAYLOAD_FIELD]: JSON.stringify(validCourse),
			},
			context,
		);

		expect(result.success).toBe(true);
		expect(calls.updated).toMatchObject([{ documentId: COURSE_ID }]);
		// Con su identidad, el alta cuelga el material pendiente de las nuevas.
		expect(result.success && result.data).toEqual({
			sessions: SAVED_SESSIONS,
		});
	});

	test("un parámetro de URL que no es uuid no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{
				[INTENT_FIELD]: COURSE_INTENTS.update,
				[PAYLOAD_FIELD]: JSON.stringify(validCourse),
			},
			context,
			"42",
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.updated).toEqual([]);
	});

	test("un curso que no se puede editar vuelve con su copia", async () => {
		const { context } = createHarness({ failsWith: "COURSE_NOT_EDITABLE" });

		const result = await run(
			{
				[INTENT_FIELD]: COURSE_INTENTS.update,
				[PAYLOAD_FIELD]: JSON.stringify(validCourse),
			},
			context,
		);

		expect(!result.success && result.error.message).toBe(
			"Un curso finalizado o cancelado ya no se puede modificar.",
		);
	});
});
