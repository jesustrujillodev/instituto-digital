import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	LESSON_1,
} from "../../../../domain/__tests__/content.fixtures";
import { CONTENT_ERROR_CODES } from "../../../../domain/content.errors";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 50,
	email: "ana@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const createHarness = (reply: unknown) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload,
		classroomService: {
			recordProgress: async (...args: unknown[]) => {
				calls.push(args);
				return reply;
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], fields: Record<string, string>) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/mis-cursos/${COURSE_DOC}/aula/${LESSON_1}`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC, lessonDocumentId: LESSON_1 },
	} as unknown as ActionArgs);

const okReply = (data: unknown) => ({
	success: true,
	data,
	timestamp: new Date().toISOString(),
});

describe("aula: registrar avance", () => {
	test("la lección sale de la URL y el estado del formulario", async () => {
		const { context, calls } = createHarness(
			okReply({ percent: 50, contentCompleted: false }),
		);

		const result = await run(context, { status: "COMPLETED" });

		expect(calls[0]?.slice(0, 2)).toEqual([
			COURSE_DOC,
			{ lessonDocumentId: LESSON_1, status: "COMPLETED" },
		]);
		expect(result).toMatchObject({
			success: true,
			message: "Lección completada.",
		});
	});

	test("abrir una lección no se anuncia", async () => {
		const { context } = createHarness(
			okReply({ percent: 0, contentCompleted: false }),
		);

		const result = await run(context, { status: "IN_PROGRESS" });

		expect(result).toMatchObject({ success: true });
		expect(result).not.toHaveProperty("message");
	});

	test("un estado desconocido se rechaza sin llegar al servicio", async () => {
		const { context, calls } = createHarness(null);

		const result = await run(context, { status: "SKIPPED" });

		expect(result).toMatchObject({ success: false });
		expect(calls).toEqual([]);
	});

	// El criterio de F-05: el rechazo lo impone el servidor, no la pantalla.
	test("sin inscripción activa responde el error localizado", async () => {
		const { context } = createHarness({
			success: false,
			error: { code: CONTENT_ERROR_CODES.NOT_ENROLLED, message: "técnico" },
			timestamp: new Date().toISOString(),
		});

		const result = await run(context, { status: "COMPLETED" });

		expect(result).toMatchObject({
			success: false,
			error: {
				code: CONTENT_ERROR_CODES.NOT_ENROLLED,
				message: "Solo quien está inscrito al curso puede entrar a su aula.",
			},
		});
	});
});
