import type * as v from "valibot";
import type {
	CourseModality,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentResult } from "@/modules/enrollments/domain/enrollment.config";
import type { AppResponse } from "@/shared/response/response.types";
import type { FinishBlocker } from "./teaching.config";
import type {
	listTeachingCoursesRule,
	saveAttendanceRule,
	saveResultsRule,
} from "./teaching.rules";

export type ListTeachingCoursesDto = v.InferOutput<
	typeof listTeachingCoursesRule
>;
export type SaveAttendanceDto = v.InferOutput<typeof saveAttendanceRule>;
export type SaveResultsDto = v.InferOutput<typeof saveResultsRule>;

// ── Lo que el repositorio lee ─────────────────────────────────────────────────

export interface TeachingSession {
	id: number;
	documentId: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
}

export interface TeachingPerson {
	firstName: string | null;
	lastName: string | null;
	email: string;
}

/** Una persona `ENROLLED` con su asistencia en las sesiones del curso. */
export interface TeachingParticipant extends TeachingPerson {
	userId: number;
	userDocumentId: string;
	isInternal: boolean;
	/** La de hoy: es la que guarda un crédito nuevo (§6.9). */
	currentDependencyId: number | null;
	currentDependencyName: string | null;
	result: EnrollmentResult;
	grade: number | null;
	completed: boolean;
	attendance: { sessionId: number; attended: boolean }[];
}

export interface TeachingCourse {
	id: number;
	documentId: string;
	title: string;
	dependencyId: number;
	dependencyName: string;
	modality: CourseModality;
	status: CourseStatus;
	minAttendance: number;
	requiresEvaluation: boolean;
	finishedAt: Date | null;
	/** Ordenadas por inicio. */
	sessions: TeachingSession[];
	trainers: TeachingPerson[];
	participants: TeachingParticipant[];
}

export interface TeachingCourseSummary {
	documentId: string;
	title: string;
	dependencyName: string;
	modality: CourseModality;
	status: CourseStatus;
	sessionCount: number;
	firstSessionAt: Date | null;
	lastSessionAt: Date | null;
	enrolledCount: number;
}

// ── Escrituras ────────────────────────────────────────────────────────────────

export interface AttendanceMark {
	userId: number;
	attended: boolean;
}

// ── Lo que ve la pantalla ─────────────────────────────────────────────────────

export interface TeachingSessionView {
	documentId: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
	/** Ya se puede pasar lista en ella. */
	isOpen: boolean;
	recorded: number;
}

export interface TeachingParticipantView extends TeachingPerson {
	userDocumentId: string;
	dependencyName: string | null;
	result: EnrollmentResult;
	grade: number | null;
	/** Lo guardado en el último cierre o corrección. */
	completed: boolean;
	/** Lo que daría el cálculo con los datos de ahora. */
	wouldComplete: boolean;
	attendedSessions: number;
	/** Porcentaje entero, 0 si el curso no tiene sesiones. */
	attendancePercent: number;
	/** `null` si todavía no se pasó lista en esa sesión. */
	marks: Record<string, boolean | null>;
}

export interface TeachingDetail {
	course: {
		documentId: string;
		title: string;
		dependencyName: string;
		modality: CourseModality;
		status: CourseStatus;
		minAttendance: number;
		requiresEvaluation: boolean;
		finishedAt: Date | null;
		finishOpensAt: Date | null;
		trainers: TeachingPerson[];
	};
	sessions: TeachingSessionView[];
	participants: TeachingParticipantView[];
	pendingResults: number;
	finishBlocker: FinishBlocker | null;
	can: {
		recordAttendance: boolean;
		recordResults: boolean;
		finish: boolean;
		/** El curso está finalizado y quien mira puede corregirlo. */
		correct: boolean;
	};
}

export interface TeachingWriteResult {
	affected: number;
}

export interface FinishResult {
	completed: number;
	credits: number;
}

export type TeachingCourseListResponse = AppResponse<TeachingCourseSummary[]>;
export type TeachingDetailResponse = AppResponse<TeachingDetail>;
export type TeachingWriteResponse = AppResponse<TeachingWriteResult>;
export type FinishResponse = AppResponse<FinishResult>;
