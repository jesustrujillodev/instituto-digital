import { describe, expect, test } from "vitest";
import {
	COURSE_INTENTS,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../../../../utils/parse-course-form-data";
import {
	type ActorOptions,
	authPayloadOf,
	failReply,
	okReply,
	postRequest,
} from "../../__tests__/route-harness";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const TRAINER_ID = "11111111-1111-4111-8111-111111111111";

const validCourse = {
	title: "Ofimática básica",
	modality: "IN_PERSON",
	access: "PUBLIC",
	capacity: 20,
	trainers: [TRAINER_ID],
	sessions: [{ date: "2026-10-05", startTime: "09:00", endTime: "13:00" }],
};

const createHarness = (options: ActorOptions & { failsWith?: string } = {}) => {
	const calls = { created: [] as unknown[] };

	const context = {
		authPayload: authPayloadOf(options),
		courseService: {
			create: async (dto: unknown) => {
				calls.created.push(dto);
				return options.failsWith ? failReply(options.failsWith) : okReply(null);
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (payload: string, context: ActionArgs["context"]) =>
	action({
		request: postRequest("/dashboard/cursos/nuevo", {
			[INTENT_FIELD]: COURSE_INTENTS.create,
			[PAYLOAD_FIELD]: payload,
		}),
		context,
	} as ActionArgs);

describe("cursos/nuevo action", () => {
	test("un participante recibe 403 sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(JSON.stringify(validCourse), context).catch(
			(e) => e,
		);

		expect(thrown.init.status).toBe(403);
		expect(calls.created).toEqual([]);
	});

	test("crea con el curso validado y conserva sus tipos", async () => {
		const { context, calls } = createHarness();

		const result = await run(JSON.stringify(validCourse), context);

		expect(result.success).toBe(true);
		expect(calls.created[0]).toMatchObject({
			capacity: 20,
			trainers: [TRAINER_ID],
		});
	});

	test("un payload inválido vuelve con errores por campo", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			JSON.stringify({ ...validCourse, title: "Of" }),
			context,
		);

		expect(!result.success && result.error.fieldErrors).toHaveProperty("title");
		expect(calls.created).toEqual([]);
	});

	test("un JSON roto se rechaza como validación", async () => {
		const { context } = createHarness();

		const result = await run("{roto", context);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
	});

	test("un fallo del servicio vuelve con la copia del módulo", async () => {
		const { context } = createHarness({
			failsWith: "COURSE_ORGANIZER_REQUIRED",
		});

		const result = await run(JSON.stringify(validCourse), context);

		expect(!result.success && result.error.message).toBe(
			"Elige la dependencia que organiza el curso.",
		);
	});
});
