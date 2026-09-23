import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	LESSON_1,
} from "../../../../domain/__tests__/content.fixtures";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const Q1 = "11111111-1111-4111-8111-111111111111";
const OPTION = "01000000-0000-4000-8000-000000000000";

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 50,
	email: "ana@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const run = (payload: unknown, reply: unknown) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload,
		quizService: {
			submit: async (...args: unknown[]) => {
				calls.push(args);
				return reply;
			},
		},
	} as unknown as ActionArgs["context"];

	const result = action({
		request: new Request(
			`https://app.example.com/dashboard/mis-cursos/${COURSE_DOC}/aula/examen`,
			{
				method: "POST",
				body: new URLSearchParams({
					intent: "submit-quiz",
					payload: JSON.stringify(payload),
				}),
			},
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

	return { result, calls };
};

describe("aula: presentar el examen", () => {
	// La ruta es la del examen: aunque el cuerpo nombre una lección, se ignora.
	test("la lección no la decide el cliente", async () => {
		const { result, calls } = run(
			{
				lessonDocumentId: LESSON_1,
				answers: [{ questionDocumentId: Q1, optionDocumentId: OPTION }],
			},
			{
				success: true,
				data: { score: 100, passed: true, passingScore: 70 },
				timestamp: new Date().toISOString(),
			},
		);

		expect(await result).toMatchObject({
			success: true,
			message: "Aprobaste con 100.",
		});
		expect(calls[0]?.slice(0, 2)).toEqual([
			COURSE_DOC,
			{
				lessonDocumentId: null,
				answers: [{ questionDocumentId: Q1, optionDocumentId: OPTION }],
			},
		]);
	});

	test("un segundo intento responde el error localizado", async () => {
		const { result } = run(
			{ answers: [{ questionDocumentId: Q1, optionDocumentId: OPTION }] },
			{
				success: false,
				error: { code: "CONTENT_QUIZ_ALREADY_TAKEN", message: "técnico" },
				timestamp: new Date().toISOString(),
			},
		);

		expect(await result).toMatchObject({
			success: false,
			error: { code: "CONTENT_QUIZ_ALREADY_TAKEN" },
		});
	});
});
