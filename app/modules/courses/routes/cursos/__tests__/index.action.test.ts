import { describe, expect, test } from "vitest";
import {
	COURSE_INTENTS,
	INTENT_FIELD,
} from "../../../utils/parse-course-form-data";
import { action } from "../index.action";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	failReply,
	okReply,
	postRequest,
} from "./route-harness";

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

const run = (fields: Record<string, string>, context: ActionArgs["context"]) =>
	action({
		request: postRequest("/dashboard/cursos", fields),
		context,
	} as ActionArgs);

describe("cursos action — guard", () => {
	test("un participante recibe 403 sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(
			{ documentId: COURSE_ID, [INTENT_FIELD]: COURSE_INTENTS.publish },
			context,
		).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.published).toEqual([]);
	});
});

describe("cursos action — intenciones", () => {
	test("publica y cancela por el documentId", async () => {
		const { context, calls } = createHarness();

		await run(
			{ documentId: COURSE_ID, [INTENT_FIELD]: COURSE_INTENTS.publish },
			context,
		);
		await run(
			{ documentId: COURSE_ID, [INTENT_FIELD]: COURSE_INTENTS.cancel },
			context,
		);

		expect(calls.published).toEqual([COURSE_ID]);
		expect(calls.cancelled).toEqual([COURSE_ID]);
	});

	test("un documentId que no es uuid no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			{ documentId: "42", [INTENT_FIELD]: COURSE_INTENTS.publish },
			context,
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls.published).toEqual([]);
	});

	test("una intención desconocida se rechaza como validación", async () => {
		const { context } = createHarness();

		const result = await run(
			{ documentId: COURSE_ID, [INTENT_FIELD]: "borrar" },
			context,
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
	});

	// Sin escalera de instanceof: el código del servicio se traduce con el
	// diccionario del módulo y la pantalla sigue en pie.
	test("un fallo de publicación vuelve con su copia, no con un status", async () => {
		const { context } = createHarness({
			failsWith: "COURSE_WITHOUT_SESSIONS",
		});

		const result = await run(
			{ documentId: COURSE_ID, [INTENT_FIELD]: COURSE_INTENTS.publish },
			context,
		);

		expect(!result.success && result.error.message).toBe(
			"Para publicar, el curso necesita al menos una sesión.",
		);
	});
});
