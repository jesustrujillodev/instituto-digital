import { describe, expect, test } from "vitest";
import {
	COURSE_INTENTS,
	INTENT_FIELD,
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

const createHarness = (options: ActorOptions & { failsWith?: string } = {}) => {
	const calls = { published: [] as string[], cancelled: [] as string[] };
	const reply = () =>
		options.failsWith ? failReply(options.failsWith) : okReply(null);

	const context = {
		authPayload: authPayloadOf(options),
		courseService: {
			publish: async (documentId: string) => {
				calls.published.push(documentId);
				return reply();
			},
			cancel: async (documentId: string) => {
				calls.cancelled.push(documentId);
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
		request: postRequest(`/dashboard/cursos/${documentId}`, fields),
		context,
		params: { documentId },
	} as unknown as ActionArgs);

describe("cursos/:documentId action", () => {
	test("publica con el documentId de la URL", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{ [INTENT_FIELD]: COURSE_INTENTS.publish },
			context,
		);

		expect(result).toMatchObject({ success: true, message: "Curso publicado" });
		expect(calls.published).toEqual([COURSE_ID]);
	});

	test("cancela con el documentId de la URL", async () => {
		const { context, calls } = createHarness();

		await run({ [INTENT_FIELD]: COURSE_INTENTS.cancel }, context);

		expect(calls.cancelled).toEqual([COURSE_ID]);
	});

	test("una publicación incompleta vuelve con la copia de lo que falta", async () => {
		const { context } = createHarness({
			failsWith: "COURSE_WITHOUT_SESSIONS",
		});

		const result = await run(
			{ [INTENT_FIELD]: COURSE_INTENTS.publish },
			context,
		);

		expect(result.success).toBe(false);
		expect(!result.success && result.error.code).toBe(
			"COURSE_WITHOUT_SESSIONS",
		);
	});

	test("guardar el formulario no se acepta en la ficha", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{ [INTENT_FIELD]: COURSE_INTENTS.update },
			context,
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.published).toEqual([]);
	});
});
