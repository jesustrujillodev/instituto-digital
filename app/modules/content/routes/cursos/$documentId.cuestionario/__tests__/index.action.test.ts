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
			deleteModuleQuiz: record("deleteModuleQuiz"),
			saveFollowUp: record("saveFollowUp"),
			saveFollowUpQuestions: record("saveFollowUpQuestions"),
			removeFollowUp: record("removeFollowUp"),
		},
	} as unknown as ActionArgs["context"];

	const result = action({
		request: new Request(
			`https://app.example.com/dashboard/capacitaciones/${COURSE_DOC}/cuestionario`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

	return { result, calls };
};

describe("capacitaciones/cuestionario action", () => {
	test("elimina la evaluación de un módulo", async () => {
		const { result, calls } = run({
			intent: "delete-module-quiz",
			payload: JSON.stringify({ moduleDocumentId: MODULE_A }),
		});

		expect(await result).toMatchObject({
			success: true,
			message: "Cuestionario del módulo eliminado.",
		});
		expect(calls.map((call) => call.args.slice(0, 2))).toEqual([
			[COURSE_DOC, { moduleDocumentId: MODULE_A }],
		]);
		expect(calls[0]?.method).toBe("deleteModuleQuiz");
	});

	test("sin módulo no llega al servicio", async () => {
		const { result, calls } = run({
			intent: "delete-module-quiz",
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
				maxAttempts: 2,
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
			maxAttempts: 2,
		});
	});
});

// docs/adr/0027: el seguimiento se define desde el paso Evaluación, en un
// solo formulario con sus preguntas.
describe("capacitaciones/cuestionario action: seguimiento", () => {
	const FOLLOW_UP = "44444444-4444-4444-8444-444444444444";
	const questions = [
		{
			statement: "¿Cuál?",
			type: "SINGLE_CHOICE",
			points: 1,
			options: [
				{ text: "Esta", isCorrect: true },
				{ text: "Aquella", isCorrect: false },
			],
		},
	];
	const form = {
		title: "Práctica de campo",
		passingScore: 60,
		maxAttempts: 1,
		shuffleQuestions: false,
		sessionDocumentId: "33333333-3333-4333-8333-333333333333",
		countsTowardGrade: true,
		availability: "SESSION_END",
		opensBeforeMinutes: null,
		closesAfterMinutes: 30,
	};

	test("guarda la configuración del modal", async () => {
		const { result, calls } = run({
			intent: "save-follow-up",
			payload: JSON.stringify(form),
		});

		expect(await result).toMatchObject({
			success: true,
			message: "Evaluación de seguimiento guardada.",
		});
		expect(calls[0]?.method).toBe("saveFollowUp");
		expect(calls[0]?.args.slice(0, 2)).toEqual([
			COURSE_DOC,
			{ ...form, followUpDocumentId: null },
		]);
	});

	test("guarda sus preguntas aparte", async () => {
		const { result, calls } = run({
			intent: "save-follow-up-questions",
			payload: JSON.stringify({ followUpDocumentId: FOLLOW_UP, questions }),
		});

		expect(await result).toMatchObject({
			success: true,
			message: "Preguntas guardadas.",
		});
		expect(calls[0]?.method).toBe("saveFollowUpQuestions");
	});

	test("sin los minutos que pide su modo no llega al servicio", async () => {
		const { result, calls } = run({
			intent: "save-follow-up",
			payload: JSON.stringify({ ...form, closesAfterMinutes: null }),
		});

		expect(await result).toMatchObject({
			success: false,
			error: { code: "VALIDATION_ERROR" },
		});
		expect(calls).toEqual([]);
	});

	test("elimina por su identificador", async () => {
		const { result, calls } = run({
			intent: "remove-follow-up",
			payload: JSON.stringify({ followUpDocumentId: FOLLOW_UP }),
		});

		expect(await result).toMatchObject({ success: true });
		expect(calls[0]?.args.slice(0, 2)).toEqual([
			COURSE_DOC,
			{ followUpDocumentId: FOLLOW_UP },
		]);
	});
});
