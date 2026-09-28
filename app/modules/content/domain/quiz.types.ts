import type * as v from "valibot";
import type {
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentResult } from "@/modules/enrollments/domain/enrollment.config";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	grantRetakeRule,
	moduleQuizRule,
	QuizAvailability,
	QuizKind,
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
	/** `null`: sin límite. */
	maxAttempts: number | null;
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

/**
 * Un cuestionario del temario presentado por alguien, con su mejor nota.
 * `itemDocumentId` es la clave con la que cuenta en el avance: la lección, si
 * es una práctica, o el propio cuestionario, si es la evaluación de un módulo.
 */
export interface QuizScoreRow {
	userId: number;
	itemDocumentId: string;
	score: number;
}

/** El último intento de cada persona en un cuestionario. */
export interface QuizAttemptRow {
	quizDocumentId: string;
	userDocumentId: string;
	number: number;
	score: number;
	passed: boolean;
	retakeGrantedAt: Date | null;
	maxAttempts: number | null;
}

/** Quien presenta, con su resultado en el curso: acreditado, ya no reintenta. */
export interface QuizParticipantRef {
	userId: number;
	result: EnrollmentResult;
	completed: boolean;
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
	maxAttempts: number | null;
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
	maxAttempts: number | null;
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
	/** Contando este; `null` sin límite. */
	attemptsLeft: number | null;
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
	/** El del último intento; si puede reintentarlo, convive con `sheet`. */
	outcome: QuizOutcome | null;
	/** Reprobó, agotó sus intentos y no ha acreditado: puede pedir otro. */
	canRequestRetake: boolean;
}

// ── Lo que ve quien imparte ───────────────────────────────────────────────────

export interface QuizBoardEntry {
	quizDocumentId: string;
	owner: QuizOwnerRef;
	kind: QuizKind;
	/** De qué cuelga: la lección, el módulo, o nada en el examen final. */
	ownerTitle: string | null;
	title: string;
	maxAttempts: number | null;
}

export interface QuizBoard {
	/** Solo en un curso publicado se habilita otro intento. */
	canGrantRetake: boolean;
	/** En el orden del temario, y el examen al final. */
	quizzes: QuizBoardEntry[];
	/** El último intento de cada persona; sin fila, no lo ha presentado. */
	attempts: QuizAttemptRow[];
}

export type QuizBankResponse = AppResponse<QuizBank | null>;
export type QuizViewResponse = AppResponse<QuizView | null>;
export type QuizOutcomeResponse = AppResponse<QuizOutcome>;
export type QuizMutationResponse = AppResponse<null>;
export type QuizBoardResponse = AppResponse<QuizBoard>;
