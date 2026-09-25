import { describe, expect, test } from "vitest";
import {
	authPayloadOf,
	COURSE_ID,
	okReply,
	postRequest,
} from "../../../__tests__/route-harness";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const createHarness = () => {
	const calls: { method: string; args: unknown[] }[] = [];
	const reply =
		(method: string) =>
		async (...args: unknown[]) => {
			calls.push({ method, args });
			return okReply(null);
		};

	const context = {
		authPayload: authPayloadOf(),
		enrollmentService: {
			enroll: reply("enroll"),
			withdraw: reply("withdraw"),
			accept: reply("accept"),
			decline: reply("decline"),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], intent: string) =>
	action({
		request: postRequest(`/dashboard/mis-cursos/${COURSE_ID}`, { intent }),
		context,
		params: { documentId: COURSE_ID },
	} as unknown as ActionArgs);

describe("mis-cursos/:documentId action", () => {
	test.each([
		["withdraw", "Te diste de baja del curso"],
		["enroll", "Quedaste inscrito"],
		["accept", "Invitación aceptada"],
		["decline", "Invitación rechazada"],
	])("%s actúa sobre el curso de la URL", async (intent, message) => {
		const { context, calls } = createHarness();

		const result = await run(context, intent);

		expect(result).toMatchObject({ success: true, message });
		expect(calls[0]).toMatchObject({ method: intent });
		expect(calls[0]?.args[0]).toBe(COURSE_ID);
	});

	test("una intención desconocida no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, "borrar");

		expect(result).toMatchObject({ success: false });
		expect(calls).toHaveLength(0);
	});
});
