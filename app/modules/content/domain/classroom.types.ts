import type * as v from "valibot";
import type {
	CourseCompletionRule,
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/enrollment.config";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	LessonProgressStatus,
	recordProgressRule,
} from "./classroom.rules";
import type { ContentLesson, LessonMaterial } from "./content.types";

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

export interface ClassroomModule {
	documentId: string;
	title: string;
	description: string | null;
	lessons: ClassroomLesson[];
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
	resumeLessonDocumentId: string | null;
}

export interface ClassroomLessonView {
	lesson: ClassroomLesson;
	material: LessonMaterial;
	previousLessonDocumentId: string | null;
	nextLessonDocumentId: string | null;
	readOnly: boolean;
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
export type ProgressResponse = AppResponse<ProgressResult>;
export type ClassroomCoursesResponse = AppResponse<string[]>;
