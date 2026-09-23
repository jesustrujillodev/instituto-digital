import type * as v from "valibot";
import type {
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	grantRetakeRule,
	moduleQuizRule,
	QuizAvailability,
	QuizQuestionType,
	renameQuizRule,
	saveQuizRule,
	submitQuizRule,
} from "./quiz.rules";

export type SaveQuizDto = v.InferOutput<typeof saveQuizRule>;
export type RenameQuizDto = v.InferOutput<typeof renameQuizRule>;
export type SubmitQuizDto = v.InferOutput<typeof submitQuizRule>;
export type ModuleQuizDto = v.InferOutput<typeof moduleQuizRule>;
export type GrantRetakeDto = v.InferOutput<typeof grantRetakeRule>;

/** De quién cuelga un cuestionario, por `documentId`. Los dos nulos: el examen. */
export interface QuizOwnerRef {
	lessonDocumentId: string | null;
	moduleDocumentId: string | null;
}

/** Lo mismo, ya resuelto a filas. */
export interface QuizOwnerIds {
	lessonId: number | null;
	moduleId: number | null;
}

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
	id: number;
	number: number;
	submittedAt: Date;
	score: number;
	passed: boolean;
	/** Con valor, hay otro intento habilitado después de este. */
	retakeGrantedAt: Date | null;
	answers: StoredAnswer[];
}

/** Un cuestionario de módulo aprobado por alguien: cuenta para su avance. */
export interface PassedModuleQuizRow {
	userId: number;
	quizDocumentId: string;
}

/** El último intento de cada persona en un cuestionario de módulo. */
export interface ModuleQuizAttemptRow {
	quizDocumentId: string;
	userDocumentId: string;
	number: number;
	score: number;
	passed: boolean;
	retakeGrantedAt: Date | null;
}

/** El curso visto por quien imparte, para autorizar el tablero y otro intento. */
export interface QuizTeachingCourseRef {
	id: number;
	status: CourseStatus;
	format: CourseFormat;
	dependencyId: number;
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
	/** El del último intento; con otro habilitado convive con `sheet`. */
	outcome: QuizOutcome | null;
}

// ── Lo que ve quien imparte ───────────────────────────────────────────────────

export interface ModuleQuizBoardEntry {
	quizDocumentId: string;
	moduleDocumentId: string;
	moduleTitle: string;
	title: string;
}

export interface ModuleQuizBoard {
	/** Solo en un curso publicado se habilita otro intento. */
	canGrantRetake: boolean;
	/** En el orden del temario. */
	quizzes: ModuleQuizBoardEntry[];
	/** El último intento de cada persona; sin fila, no lo ha presentado. */
	attempts: ModuleQuizAttemptRow[];
}

export type QuizBankResponse = AppResponse<QuizBank | null>;
export type QuizViewResponse = AppResponse<QuizView | null>;
export type QuizOutcomeResponse = AppResponse<QuizOutcome>;
export type QuizMutationResponse = AppResponse<null>;
export type ModuleQuizBoardResponse = AppResponse<ModuleQuizBoard>;
