import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	failReply,
	okReply,
	postRequest,
	USER_ID,
} from "../../../__tests__/route-harness";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const createHarness = (
	options: ActorOptions & {
		fails?: { code: string; details?: Record<string, unknown> };
	} = {},
) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const reply =
		(method: string, data: unknown) =>
		async (...args: unknown[]) => {
			calls.push({ method, args });
			return options.fails
				? failReply(options.fails.code, options.fails.details)
				: okReply(data);
		};

	const context = {
		authPayload: authPayloadOf(options),
		enrollmentService: {
			enroll: reply("enroll", null),
			withdraw: reply("withdraw", null),
			accept: reply("accept", null),
			decline: reply("decline", null),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (
	context: ActionArgs["context"],
	fields: Record<string, string | string[]>,
	documentId = COURSE_ID,
) =>
	action({
		request: postRequest(`/dashboard/cursos-disponibles/${documentId}`, fields),
		context,
		params: { documentId },
	} as unknown as ActionArgs);

describe("cursos-disponibles/:documentId action", () => {
	test("inscribirse llama al servicio con el curso de la URL", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { intent: "enroll" });

		expect(result).toMatchObject({
			success: true,
			message: "Quedaste inscrito",
		});
		expect(calls[0]).toMatchObject({ method: "enroll" });
		expect(calls[0]?.args[0]).toBe(COURSE_ID);
	});

	test("sin cupo devuelve la copia del módulo sin cortar la pantalla", async () => {
		const { context } = createHarness({
			fails: { code: "ENROLLMENT_FULL", details: { seatsLeft: 0 } },
		});

		const result = await run(context, { intent: "enroll" });

		expect(result).toMatchObject({
			success: false,
			error: {
				code: "ENROLLMENT_FULL",
				message: "El curso ya no tiene lugares disponibles.",
			},
		});
	});

	test("inscribir a otras personas ya no se atiende desde la ficha", async () => {
		const { context, calls } = createHarness({ role: "DEPENDENCY_HEAD" });

		const result = await run(context, {
			intent: "assign",
			userDocumentIds: [USER_ID],
		});

		expect(result).toMatchObject({ success: false });
		expect(calls).toHaveLength(0);
	});

	test("una intención desconocida no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { intent: "borrar" });

		expect(result).toMatchObject({ success: false });
		expect(calls).toHaveLength(0);
	});

	test("un documentId inválido falla sin llamar al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { intent: "enroll" }, "no-es-uuid");

		expect(result).toMatchObject({ success: false });
		expect(calls).toHaveLength(0);
	});

	test("un externo recibe 403", async () => {
		const { context } = createHarness({ dependencyId: null, isTrainer: true });

		const thrown = await run(context, { intent: "enroll" }).catch((e) => e);

		expect(thrown.init.status).toBe(403);
	});
});
