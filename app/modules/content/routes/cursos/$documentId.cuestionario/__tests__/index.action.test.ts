import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	MODULE_A,
} from "../../../../domain/__tests__/content.fixtures";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 2,
	email: "laura.sop@instituto.gob.mx",
	role: "DEPENDENCY_HEAD",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const run = (fields: Record<string, string>) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			calls.push({ method, args });
			return { success: true, data: null, timestamp: new Date().toISOString() };
		};
	const context = {
		authPayload,
		quizService: {
			saveBank: record("saveBank"),
			renameQuiz: record("renameQuiz"),
			archiveModuleQuiz: record("archiveModuleQuiz"),
		},
	} as unknown as ActionArgs["context"];

	const result = action({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${COURSE_DOC}/cuestionario`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

	return { result, calls };
};

describe("cursos/cuestionario action", () => {
	test("archiva la evaluación de un módulo", async () => {
		const { result, calls } = run({
			intent: "archive-module-quiz",
			payload: JSON.stringify({ moduleDocumentId: MODULE_A }),
		});

		expect(await result).toMatchObject({
			success: true,
			message: "Cuestionario del módulo archivado.",
		});
		expect(calls.map((call) => call.args.slice(0, 2))).toEqual([
			[COURSE_DOC, { moduleDocumentId: MODULE_A }],
		]);
		expect(calls[0]?.method).toBe("archiveModuleQuiz");
	});

	test("sin módulo no llega al servicio", async () => {
		const { result, calls } = run({
			intent: "archive-module-quiz",
			payload: JSON.stringify({}),
		});

		expect(await result).toMatchObject({ success: false });
		expect(calls).toEqual([]);
	});

	test("el banco de un módulo viaja con su módulo", async () => {
		const { result, calls } = run({
			intent: "save-quiz",
			payload: JSON.stringify({
				lessonDocumentId: null,
				moduleDocumentId: MODULE_A,
				title: "Evaluación",
				passingScore: 70,
				shuffleQuestions: false,
				questions: [
					{
						statement: "¿Cuál?",
						type: "SINGLE_CHOICE",
						points: 1,
						options: [
							{ text: "A", isCorrect: true },
							{ text: "B", isCorrect: false },
						],
					},
				],
			}),
		});

		expect(await result).toMatchObject({ success: true });
		expect(calls[0]?.args[1]).toMatchObject({
			lessonDocumentId: null,
			moduleDocumentId: MODULE_A,
		});
	});
});
