import { describe, expect, test } from "vitest";
import {
	type DraftQuestion,
	emptyQuestion,
	type QuizDraft,
	questionProblemsOf,
	quizProblemsOf,
	quizSummaryOf,
	sameQuizDraft,
} from "../quiz-draft";

const questionOf = (overrides: Partial<DraftQuestion> = {}): DraftQuestion => ({
	...emptyQuestion(),
	statement: "¿Qué es UX?",
	options: [
		{ key: "a", text: "La experiencia", isCorrect: true },
		{ key: "b", text: "Un lenguaje", isCorrect: false },
	],
	...overrides,
});

const draftOf = (overrides: Partial<QuizDraft> = {}): QuizDraft => ({
	title: "Examen final",
	passingScore: 70,
	shuffleQuestions: false,
	questions: [questionOf()],
	...overrides,
});

describe("questionProblemsOf", () => {
	test("una pregunta completa no tiene problemas", () => {
		expect(questionProblemsOf(questionOf())).toEqual([]);
	});

	test("nombra la opción vacía por su letra", () => {
		const question = questionOf({
			options: [
				{ key: "a", text: "Sí", isCorrect: true },
				{ key: "b", text: "No", isCorrect: false },
				{ key: "c", text: " ", isCorrect: false },
			],
		});

		expect(questionProblemsOf(question)).toEqual(["La opción C está vacía"]);
	});

	// Un campo de puntos vacío es NaN, no 0: el aviso es el mismo.
	test.each([Number.NaN, 0, 11, 1.5])(
		"los puntos %d no se aceptan",
		(points) => {
			expect(questionProblemsOf(questionOf({ points }))).toEqual([
				"Vale de 1 a 10 puntos",
			]);
		},
	);

	test("sin enunciado lo dice primero", () => {
		expect(questionProblemsOf(questionOf({ statement: "" }))[0]).toBe(
			"Falta el enunciado",
		);
	});
});

describe("quizProblemsOf", () => {
	test("dice de qué pregunta es cada problema", () => {
		expect(
			quizProblemsOf(
				draftOf({ questions: [questionOf(), questionOf({ statement: "" })] }),
			),
		).toEqual(["Pregunta 2: Falta el enunciado."]);
	});

	test("sin preguntas ni porcentaje válido no se guarda", () => {
		expect(
			quizProblemsOf(draftOf({ questions: [], passingScore: Number.NaN })),
		).toEqual([
			"El porcentaje para aprobar es un entero de 0 a 100.",
			"Agrega al menos una pregunta.",
		]);
	});
});

describe("quizSummaryOf", () => {
	test("cuenta preguntas, puntos y cuántos hacen falta para aprobar", () => {
		const questions = Array.from({ length: 5 }, () => questionOf());

		expect(quizSummaryOf(draftOf({ questions }))).toBe(
			"5 preguntas · 5 puntos · se aprueba con 4",
		);
	});

	test("sin porcentaje válido no promete cuántos hacen falta", () => {
		expect(quizSummaryOf(draftOf({ passingScore: Number.NaN }))).toBe(
			"1 pregunta · 1 punto",
		);
	});

	test("sin preguntas no hay resumen", () => {
		expect(quizSummaryOf(draftOf({ questions: [] }))).toBeNull();
	});
});

describe("sameQuizDraft", () => {
	test("las llaves de interfaz no cuentan como cambio", () => {
		const a = draftOf();
		const b = draftOf({
			questions: a.questions.map((question) => ({ ...question, key: "otra" })),
		});

		expect(sameQuizDraft(a, b)).toBe(true);
		expect(sameQuizDraft(a, draftOf({ title: "Otro" }))).toBe(false);
	});
});
