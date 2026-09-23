import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	LESSON_1,
	MODULE_A,
	MODULE_B,
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

const run = (payload: unknown, passed: boolean) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload,
		quizService: {
			submit: async (...args: unknown[]) => {
				calls.push(args);
				return {
					success: true,
					data: { score: passed ? 90 : 40, passed, passingScore: 70 },
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as ActionArgs["context"];

	const result = action({
		request: new Request(
			`https://app.example.com/dashboard/mis-cursos/${COURSE_DOC}/aula/modulo/${MODULE_A}`,
			{
				method: "POST",
				body: new URLSearchParams({
					intent: "submit-quiz",
					payload: JSON.stringify(payload),
				}),
			},
		),
		context,
		params: { documentId: COURSE_DOC, moduleDocumentId: MODULE_A },
	} as unknown as ActionArgs);

	return { result, calls };
};

const answers = [{ questionDocumentId: Q1, optionDocumentId: OPTION }];

describe("aula: presentar la evaluación del módulo", () => {
	// El módulo sale de la URL: aunque el cuerpo nombre otro o una lección, se ignora.
	test("ni el módulo ni la lección los decide el cliente", async () => {
		const { result, calls } = run(
			{ lessonDocumentId: LESSON_1, moduleDocumentId: MODULE_B, answers },
			true,
		);

		expect(await result).toMatchObject({
			success: true,
			message: "Aprobaste el módulo con 90.",
		});
		expect(calls[0]?.slice(0, 2)).toEqual([
			COURSE_DOC,
			{ lessonDocumentId: null, moduleDocumentId: MODULE_A, answers },
		]);
	});

	test("reprobarla dice cuánto faltó", async () => {
		const { result } = run({ answers }, false);

		expect(await result).toMatchObject({
			success: true,
			message: "Obtuviste 40; el mínimo era 70.",
		});
	});

	test("respuestas mal formadas no llegan al servicio", async () => {
		const { result, calls } = run({ answers: "todas" }, true);

		expect(await result).toMatchObject({ success: false });
		expect(calls).toEqual([]);
	});
});
