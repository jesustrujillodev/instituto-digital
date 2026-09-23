import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { CONTENT_ERROR_CODES } from "../content.errors";
import {
	assertBankEditable,
	assertCanSubmit,
	gradeAttempt,
	quizAvailabilityOf,
	saveQuizRule,
	toQuizBankWrite,
	toQuizOutcome,
	toQuizSheet,
	toTrueFalseOptions,
} from "../quiz.rules";
import type { StoredQuiz } from "../quiz.types";

const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const Q3 = "33333333-3333-4333-8333-333333333333";

const optionOf = (id: number, isCorrect: boolean) => ({
	id,
	documentId: `0000000${id}-0000-4000-8000-000000000000`,
	text: `Opción ${id}`,
	isCorrect,
});

/** Tres preguntas de 1, 2 y 3 puntos: seis en total, mínimo 70. */
const quizOf = (overrides: Partial<StoredQuiz> = {}): StoredQuiz => ({
	id: 1,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	title: "Examen final",
	passingScore: 70,
	shuffleQuestions: false,
	questions: [
		{
			id: 10,
			documentId: Q1,
			statement: "¿Uno?",
			type: "SINGLE_CHOICE",
			points: 1,
			options: [optionOf(1, true), optionOf(2, false)],
		},
		{
			id: 20,
			documentId: Q2,
			statement: "¿Dos?",
			type: "TRUE_FALSE",
			points: 2,
			options: [optionOf(3, false), optionOf(4, true)],
		},
		{
			id: 30,
			documentId: Q3,
			statement: "¿Tres?",
			type: "SINGLE_CHOICE",
			points: 3,
			options: [optionOf(5, true), optionOf(6, false), optionOf(7, false)],
		},
	],
	...overrides,
});

const answer = (questionDocumentId: string, optionId: number) => ({
	questionDocumentId,
	optionDocumentId: `0000000${optionId}-0000-4000-8000-000000000000`,
});

const codeOf = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return null;
};

describe("gradeAttempt", () => {
	test("todas correctas da 100 y aprueba", () => {
		const graded = gradeAttempt(quizOf(), [
			answer(Q1, 1),
			answer(Q2, 4),
			answer(Q3, 5),
		]);

		expect(graded).toMatchObject({ score: 100, passed: true });
		expect(graded.answers).toEqual([
			{ questionId: 10, optionId: 1, isCorrect: true },
			{ questionId: 20, optionId: 4, isCorrect: true },
			{ questionId: 30, optionId: 5, isCorrect: true },
		]);
	});

	test("ninguna correcta da 0", () => {
		expect(
			gradeAttempt(quizOf(), [answer(Q1, 2), answer(Q2, 3), answer(Q3, 6)]),
		).toMatchObject({ score: 0, passed: false });
	});

	// 1 + 3 de 6 puntos = 66,6…: se redondea hacia abajo, como la asistencia.
	test("los puntos pesan distinto y se redondea hacia abajo", () => {
		expect(
			gradeAttempt(quizOf(), [answer(Q1, 1), answer(Q2, 3), answer(Q3, 5)]),
		).toMatchObject({ score: 66, passed: false });
	});

	test("quien llega justo a la mínima aprueba", () => {
		const quiz = quizOf({ passingScore: 50 });

		expect(
			gradeAttempt(quiz, [answer(Q1, 2), answer(Q2, 3), answer(Q3, 5)]),
		).toMatchObject({ score: 50, passed: true });
	});

	test.each([
		["falta una pregunta", [answer(Q1, 1), answer(Q2, 4)]],
		[
			"una pregunta respondida dos veces",
			[answer(Q1, 1), answer(Q1, 2), answer(Q2, 4)],
		],
		[
			"una opción que es de otra pregunta",
			[answer(Q1, 5), answer(Q2, 4), answer(Q3, 5)],
		],
	])("%s se rechaza", (_, answers) => {
		expect(codeOf(() => gradeAttempt(quizOf(), answers))).toBe(
			CONTENT_ERROR_CODES.QUIZ_INCOMPLETE,
		);
	});
});

describe("lo que ve quien lo presenta", () => {
	test("la hoja no lleva la respuesta correcta", () => {
		const sheet = toQuizSheet(quizOf(), "semilla");

		expect(JSON.stringify(sheet)).not.toContain("isCorrect");
		expect(sheet.totalPoints).toBe(6);
	});

	test("barajar con la misma semilla da el mismo orden", () => {
		const quiz = quizOf({ shuffleQuestions: true });
		const order = (seed: string) =>
			toQuizSheet(quiz, seed).questions.map((question) => question.documentId);

		expect(order("quiz:50")).toEqual(order("quiz:50"));
		expect([...order("quiz:50")].sort()).toEqual([Q1, Q2, Q3].sort());
	});

	test("el resultado dice qué acertó, no cuál era la correcta", () => {
		const outcome = toQuizOutcome(quizOf(), {
			submittedAt: new Date("2027-03-10T18:00:00Z"),
			score: 66,
			passed: false,
			answers: [
				{ questionId: 10, optionId: 1, isCorrect: true },
				{ questionId: 20, optionId: 3, isCorrect: false },
				{ questionId: 30, optionId: 5, isCorrect: true },
			],
		});

		expect(outcome.questions.map((question) => question.correct)).toEqual([
			true,
			false,
			true,
		]);
		expect(JSON.stringify(outcome)).not.toMatch(/isCorrect|optionId|options/);
	});
});

describe("disponibilidad", () => {
	const content = { completionRule: "CONTENT" as const };
	const attendance = { completionRule: "ATTENDANCE" as const };
	const taken = {
		submittedAt: new Date(),
		score: 80,
		passed: true,
		answers: [],
	};

	test("el examen de un curso por contenido espera a terminar las obligatorias", () => {
		expect(quizAvailabilityOf(content, null, null, true)).toBe(
			"LOCKED_BY_CONTENT",
		);
		expect(quizAvailabilityOf(content, new Date(), null, true)).toBe(
			"AVAILABLE",
		);
	});

	test("sin contenido que contar, está disponible desde la inscripción", () => {
		expect(quizAvailabilityOf(attendance, null, null, true)).toBe("AVAILABLE");
	});

	test("la práctica nunca espera al contenido", () => {
		expect(quizAvailabilityOf(content, null, null, false)).toBe("AVAILABLE");
	});

	test("presentado es presentado, y un segundo envío se rechaza", () => {
		expect(quizAvailabilityOf(content, new Date(), taken, true)).toBe("TAKEN");
		expect(codeOf(() => assertCanSubmit("TAKEN"))).toBe(
			CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN,
		);
		expect(codeOf(() => assertCanSubmit("LOCKED_BY_CONTENT"))).toBe(
			CONTENT_ERROR_CODES.QUIZ_NOT_AVAILABLE,
		);
	});
});

describe("el banco", () => {
	const questionOf = (overrides: Record<string, unknown> = {}) => ({
		statement: "¿Cuál?",
		type: "SINGLE_CHOICE",
		points: 1,
		options: [
			{ text: "A", isCorrect: true },
			{ text: "B", isCorrect: false },
		],
		...overrides,
	});
	const bankOf = (question: Record<string, unknown>) => ({
		lessonDocumentId: null,
		title: "Examen",
		passingScore: 70,
		shuffleQuestions: false,
		questions: [question],
	});

	test("una pregunta válida pasa", () => {
		expect(v.safeParse(saveQuizRule, bankOf(questionOf())).success).toBe(true);
	});

	test.each([
		[
			"sin correcta",
			{
				options: [
					{ text: "A", isCorrect: false },
					{ text: "B", isCorrect: false },
				],
			},
		],
		[
			"con dos correctas",
			{
				options: [
					{ text: "A", isCorrect: true },
					{ text: "B", isCorrect: true },
				],
			},
		],
		["con una sola opción", { options: [{ text: "A", isCorrect: true }] }],
		["con puntos fuera de rango", { points: 11 }],
	])("una pregunta %s se rechaza", (_, overrides) => {
		expect(
			v.safeParse(saveQuizRule, bankOf(questionOf(overrides))).success,
		).toBe(false);
	});

	test("verdadero o falso lleva siempre sus dos textos fijos", () => {
		expect(toTrueFalseOptions(1)).toEqual([
			{ text: "Verdadero", isCorrect: false },
			{ text: "Falso", isCorrect: true },
		]);

		const write = toQuizBankWrite(
			v.parse(
				saveQuizRule,
				bankOf(
					questionOf({
						type: "TRUE_FALSE",
						options: [
							{ text: "Sí", isCorrect: true },
							{ text: "No", isCorrect: false },
						],
					}),
				),
			),
		);

		expect(write.questions[0]?.options).toEqual(toTrueFalseOptions(0));
	});

	test("con un intento enviado el banco se congela", () => {
		expect(() => assertBankEditable(0)).not.toThrow();
		expect(codeOf(() => assertBankEditable(1))).toBe(
			CONTENT_ERROR_CODES.QUIZ_LOCKED,
		);
	});
});
