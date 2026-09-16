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
		published: [] as string[],
	};
	const reply = () =>
		options.failsWith ? failReply(options.failsWith) : okReply(null);

	const context = {
		authPayload: authPayloadOf(options),
		courseService: {
			update: async (documentId: string, dto: unknown) => {
				calls.updated.push({ documentId, dto });
				return reply();
			},
			publish: async (documentId: string) => {
				calls.published.push(documentId);
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
		request: postRequest(`/dashboard/cursos/${documentId}/editar`, fields),
		context,
		params: { documentId },
	} as unknown as ActionArgs);

describe("cursos/editar action", () => {
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
	});

	test("publica desde la ficha sin mandar el formulario", async () => {
		const { context, calls } = createHarness();

		await run({ [INTENT_FIELD]: COURSE_INTENTS.publish }, context);

		expect(calls.published).toEqual([COURSE_ID]);
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
