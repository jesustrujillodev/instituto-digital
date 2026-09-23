import type * as v from "valibot";
import type {
	CourseCompletionRule,
	CourseFormat,
	CourseStatus,
	EvaluationMethod,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/enrollment.config";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	LessonProgressStatus,
	recordProgressRule,
} from "./classroom.rules";
import type { ContentLesson, LessonMaterial } from "./content.types";
import type { QuizAvailability } from "./quiz.rules";

export type RecordProgressDto = v.InferOutput<typeof recordProgressRule>;

// ── Lo que el repositorio lee ─────────────────────────────────────────────────

/** El curso visto desde el aula, con la inscripción de quien la abre. */
export interface ClassroomCourse {
	id: number;
	documentId: string;
	title: string;
	status: CourseStatus;
	format: CourseFormat;
	completionRule: CourseCompletionRule;
	requiresEvaluation: boolean;
	evaluationMethod: EvaluationMethod;
	enrollment: {
		status: EnrollmentStatus;
		progressPercent: number;
		contentCompletedAt: Date | null;
		completed: boolean;
	} | null;
}

export interface LessonProgressRow {
	lessonDocumentId: string;
	status: LessonProgressStatus;
}

/** Una lección terminada por alguien del curso: de ahí sale cada porcentaje. */
export interface CompletedLessonRow {
	userId: number;
	lessonDocumentId: string;
}

// ── Lo que ve la pantalla ─────────────────────────────────────────────────────

/** `null`: sin empezar. La ausencia de fila no se rellena con un centinela. */
export interface ClassroomLesson extends ContentLesson {
	status: LessonProgressStatus | null;
}

/** Un cuestionario en el índice del aula, con el último intento de quien lo ve. */
export interface ClassroomQuizStatus {
	title: string;
	availability: QuizAvailability;
	score: number | null;
	passed: boolean | null;
}

export interface ClassroomModule {
	documentId: string;
	title: string;
	description: string | null;
	lessons: ClassroomLesson[];
	/** Su evaluación, si tiene una con preguntas (docs/adr/0016). */
	quiz: ClassroomQuizStatus | null;
}

/** Una parada del aula: una lección, o la evaluación de un módulo (por su módulo). */
export interface ClassroomStop {
	kind: "LESSON" | "MODULE_QUIZ";
	documentId: string;
}

export interface ClassroomView {
	course: {
		documentId: string;
		title: string;
		completionRule: CourseCompletionRule;
		/** Si terminar las lecciones cuenta para completar el curso. */
		countsContent: boolean;
		/** Finalizado: se lee, pero ya no se registra avance. */
		readOnly: boolean;
	};
	modules: ClassroomModule[];
	percent: number;
	contentCompletedAt: Date | null;
	completed: boolean;
	/** A dónde lleva «Continuar»; `null` con el temario vacío. */
	resume: ClassroomStop | null;
	/** El examen, si el curso se evalúa con uno que ya tiene preguntas. */
	finalQuiz: ClassroomQuizStatus | null;
}

export interface ClassroomLessonView {
	lesson: ClassroomLesson;
	material: LessonMaterial;
	previous: ClassroomStop | null;
	next: ClassroomStop | null;
	readOnly: boolean;
}

/** La evaluación de un módulo como parada del recorrido. */
export interface ClassroomModuleQuizView {
	moduleTitle: string;
	previous: ClassroomStop | null;
	next: ClassroomStop | null;
}

export interface ProgressResult {
	percent: number;
	contentCompleted: boolean;
}

/** El avance de cada persona tras recalcularlo. */
export interface ProgressState {
	userId: number;
	percent: number;
	contentCompleted: boolean;
}

export type ClassroomResponse = AppResponse<ClassroomView>;
export type ClassroomLessonResponse = AppResponse<ClassroomLessonView>;
export type ClassroomModuleQuizResponse = AppResponse<ClassroomModuleQuizView>;
export type ProgressResponse = AppResponse<ProgressResult>;
export type ClassroomCoursesResponse = AppResponse<string[]>;
