import {
	QUIZ_DEFAULT_PASSING_SCORE,
	QUIZ_OPTION_MAX_LENGTH,
	QUIZ_POINTS_RANGE,
	QUIZ_STATEMENT_MAX_LENGTH,
	QUIZ_TITLE_MAX_LENGTH,
	TRUE_FALSE_LABELS,
} from "../domain/content.config";
import {
	FINAL_QUIZ_OWNER,
	pointsToPass,
	type QuizQuestionType,
} from "../domain/quiz.rules";
import type { QuizBank, QuizOwnerRef } from "../domain/quiz.types";

export interface DraftOption {
	key: string;
	text: string;
	isCorrect: boolean;
}

export interface DraftQuestion {
	key: string;
	statement: string;
	type: QuizQuestionType;
	/** `NaN` mientras el campo está vacío: vacío no es cero. */
	points: number;
	options: DraftOption[];
}

export interface QuizDraft {
	title: string;
	/** `NaN` mientras el campo está vacío. */
	passingScore: number;
	shuffleQuestions: boolean;
	questions: DraftQuestion[];
}

let keySeed = 0;
export const nextKey = () => `k${++keySeed}`;

export const trueFalseOptions = (correctIndex = 0): DraftOption[] =>
	TRUE_FALSE_LABELS.map((text, index) => ({
		key: nextKey(),
		text,
		isCorrect: index === correctIndex,
	}));

export const emptyOptions = (): DraftOption[] => [
	{ key: nextKey(), text: "", isCorrect: true },
	{ key: nextKey(), text: "", isCorrect: false },
];

export const emptyQuestion = (): DraftQuestion => ({
	key: nextKey(),
	statement: "",
	type: "SINGLE_CHOICE",
	points: 1,
	options: emptyOptions(),
});

export const toQuizDraft = (
	bank: QuizBank | null,
	defaultTitle: string,
): QuizDraft => ({
	title: bank?.title ?? defaultTitle,
	passingScore: bank?.passingScore ?? QUIZ_DEFAULT_PASSING_SCORE,
	shuffleQuestions: bank?.shuffleQuestions ?? false,
	questions: (bank?.questions ?? []).map((question) => ({
		key: question.documentId,
		statement: question.statement,
		type: question.type,
		points: question.points,
		options: question.options.map((option) => ({
			key: option.documentId,
			text: option.text,
			isCorrect: option.isCorrect,
		})),
	})),
});

export const quizPayloadOf = (draft: QuizDraft, owner: QuizOwnerRef) => ({
	...owner,
	title: draft.title,
	passingScore: draft.passingScore,
	shuffleQuestions: draft.shuffleQuestions,
	questions: draft.questions.map((question) => ({
		statement: question.statement,
		type: question.type,
		points: question.points,
		options: question.options.map(({ text, isCorrect }) => ({
			text,
			isCorrect,
		})),
	})),
});

export const sameQuizDraft = (a: QuizDraft, b: QuizDraft) =>
	JSON.stringify(quizPayloadOf(a, FINAL_QUIZ_OWNER)) ===
	JSON.stringify(quizPayloadOf(b, FINAL_QUIZ_OWNER));

const inRange = (value: number, min: number, max: number) =>
	Number.isInteger(value) && value >= min && value <= max;

/** "A", "B", "C": como se nombra una opción en los avisos. */
export const optionLetter = (index: number) => String.fromCharCode(65 + index);

/**
 * Lo que le falta a una pregunta para poder guardarse: las mismas reglas que
 * `saveQuizRule`, dichas sobre la pregunta y no sobre el banco.
 */
export const questionProblemsOf = (question: DraftQuestion): string[] => {
	const problems: string[] = [];
	const statement = question.statement.trim();

	if (statement === "") problems.push("Falta el enunciado");
	else if (statement.length > QUIZ_STATEMENT_MAX_LENGTH) {
		problems.push(
			`El enunciado pasa de ${QUIZ_STATEMENT_MAX_LENGTH} caracteres`,
		);
	}

	question.options.forEach((option, index) => {
		const text = option.text.trim();
		if (text === "") {
			problems.push(`La opción ${optionLetter(index)} está vacía`);
		} else if (text.length > QUIZ_OPTION_MAX_LENGTH) {
			problems.push(
				`La opción ${optionLetter(index)} pasa de ${QUIZ_OPTION_MAX_LENGTH} caracteres`,
			);
		}
	});

	if (!inRange(question.points, QUIZ_POINTS_RANGE.min, QUIZ_POINTS_RANGE.max)) {
		problems.push(
			`Vale de ${QUIZ_POINTS_RANGE.min} a ${QUIZ_POINTS_RANGE.max} puntos`,
		);
	}

	return problems;
};

/** Todo lo que el servidor rechazaría, dicho antes de enviar. */
export const quizProblemsOf = (draft: QuizDraft): string[] => {
	const problems: string[] = [];
	const title = draft.title.trim();

	if (title === "") problems.push("Escribe el nombre.");
	else if (title.length > QUIZ_TITLE_MAX_LENGTH) {
		problems.push(`El nombre pasa de ${QUIZ_TITLE_MAX_LENGTH} caracteres.`);
	}
	if (!inRange(draft.passingScore, 0, 100)) {
		problems.push("El porcentaje para aprobar es un entero de 0 a 100.");
	}
	if (draft.questions.length === 0) {
		problems.push("Agrega al menos una pregunta.");
	}

	draft.questions.forEach((question, index) => {
		for (const problem of questionProblemsOf(question)) {
			problems.push(`Pregunta ${index + 1}: ${problem}.`);
		}
	});

	return problems;
};

/** "5 preguntas · 5 puntos · se aprueba con 4", o `null` sin nada que contar. */
export const quizSummaryOf = (draft: QuizDraft): string | null => {
	if (draft.questions.length === 0) return null;

	const total = draft.questions.reduce(
		(sum, question) =>
			sum + (Number.isInteger(question.points) ? question.points : 0),
		0,
	);
	const parts = [
		draft.questions.length === 1
			? "1 pregunta"
			: `${draft.questions.length} preguntas`,
		total === 1 ? "1 punto" : `${total} puntos`,
	];
	if (total > 0 && inRange(draft.passingScore, 0, 100)) {
		parts.push(`se aprueba con ${pointsToPass(total, draft.passingScore)}`);
	}

	return parts.join(" · ");
};
