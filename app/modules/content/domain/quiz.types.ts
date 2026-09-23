import type * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	QuizAvailability,
	QuizQuestionType,
	renameQuizRule,
	saveQuizRule,
	submitQuizRule,
} from "./quiz.rules";

export type SaveQuizDto = v.InferOutput<typeof saveQuizRule>;
export type RenameQuizDto = v.InferOutput<typeof renameQuizRule>;
export type SubmitQuizDto = v.InferOutput<typeof submitQuizRule>;

// ── Lo que el repositorio lee y escribe ───────────────────────────────────────

export interface StoredQuizOption {
	id: number;
	documentId: string;
	text: string;
	isCorrect: boolean;
}

export interface StoredQuizQuestion {
	id: number;
	documentId: string;
	statement: string;
	type: QuizQuestionType;
	points: number;
	/** En su orden. */
	options: StoredQuizOption[];
}

export interface StoredQuiz {
	id: number;
	documentId: string;
	title: string;
	passingScore: number;
	shuffleQuestions: boolean;
	/** En su orden. */
	questions: StoredQuizQuestion[];
}

export interface StoredAnswer {
	questionId: number;
	optionId: number;
	isCorrect: boolean;
}

export interface StoredAttempt {
	submittedAt: Date;
	score: number;
	passed: boolean;
	answers: StoredAnswer[];
}

/** El banco ya normalizado, listo para reescribir preguntas y opciones. */
export interface QuizBankWrite {
	title: string;
	passingScore: number;
	shuffleQuestions: boolean;
	questions: {
		statement: string;
		type: QuizQuestionType;
		points: number;
		options: { text: string; isCorrect: boolean }[];
	}[];
}

export interface GradedAttempt {
	score: number;
	passed: boolean;
	answers: StoredAnswer[];
}

// ── Lo que ve quien lo arma ───────────────────────────────────────────────────

export interface QuizBank {
	documentId: string;
	title: string;
	passingScore: number;
	shuffleQuestions: boolean;
	questions: {
		documentId: string;
		statement: string;
		type: QuizQuestionType;
		points: number;
		options: { documentId: string; text: string; isCorrect: boolean }[];
	}[];
	/** Con intentos, el banco queda congelado y solo cambia el título. */
	attemptCount: number;
}

// ── Lo que ve quien lo presenta ───────────────────────────────────────────────

/** Sin `isCorrect`: la opción correcta nunca viaja al cliente. */
export interface QuizSheet {
	documentId: string;
	title: string;
	passingScore: number;
	totalPoints: number;
	questions: {
		documentId: string;
		statement: string;
		type: QuizQuestionType;
		points: number;
		options: { documentId: string; text: string }[];
	}[];
}

/** Qué acertó, pero no cuál era la correcta. */
export interface QuizOutcome {
	score: number;
	passed: boolean;
	passingScore: number;
	submittedAt: Date;
	questions: { documentId: string; statement: string; correct: boolean }[];
}

/**
 * Un cuestionario para quien lo presenta. `sheet` solo existe si está
 * disponible; `outcome`, si ya lo presentó.
 */
export interface QuizView {
	availability: QuizAvailability;
	title: string;
	questionCount: number;
	sheet: QuizSheet | null;
	outcome: QuizOutcome | null;
}

export type QuizBankResponse = AppResponse<QuizBank | null>;
export type QuizViewResponse = AppResponse<QuizView | null>;
export type QuizOutcomeResponse = AppResponse<QuizOutcome>;
export type QuizMutationResponse = AppResponse<null>;
