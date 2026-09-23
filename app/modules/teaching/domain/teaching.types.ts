import type * as v from "valibot";
import type {
	CourseCompletionRule,
	CourseFormat,
	CourseModality,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { CreditDiff } from "@/modules/credits/domain/credit.types";
import type { EnrollmentResult } from "@/modules/enrollments/domain/enrollment.config";
import type { AppResponse } from "@/shared/response/response.types";
import type { FinishBlocker } from "./teaching.config";
import type {
	listTeachingCoursesRule,
	saveAttendanceRule,
	saveResultsRule,
	setEnrollmentOpenRule,
} from "./teaching.rules";

export type ListTeachingCoursesDto = v.InferOutput<
	typeof listTeachingCoursesRule
>;
export type SaveAttendanceDto = v.InferOutput<typeof saveAttendanceRule>;
export type SaveResultsDto = v.InferOutput<typeof saveResultsRule>;
export type SetEnrollmentOpenDto = v.InferOutput<typeof setEnrollmentOpenRule>;

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
	/** Caché del avance por lección: solo para mostrar. */
	progressPercent: number;
	/** Lo que la regla lee: se fija al terminar las obligatorias y no se borra. */
	contentCompletedAt: Date | null;
	attendance: { sessionId: number; attended: boolean }[];
}

export interface TeachingCourse {
	id: number;
	documentId: string;
	title: string;
	dependencyId: number;
	createdById: number;
	dependencyName: string;
	modality: CourseModality;
	format: CourseFormat;
	completionRule: CourseCompletionRule;
	status: CourseStatus;
	minAttendance: number;
	requiresEvaluation: boolean;
	finishedAt: Date | null;
	enrollmentClosedAt: Date | null;
	/** Nulo mientras nadie genere el QR de asistencia (§6.8). */
	qrToken: string | null;
	qrTokenRotatedAt: Date | null;
	qrOpensBeforeMinutes: number;
	qrClosesAfterMinutes: number;
	/** Ordenadas por inicio. */
	sessions: TeachingSession[];
	trainers: TeachingPerson[];
	participants: TeachingParticipant[];
}

export interface TeachingCourseSummary {
	documentId: string;
	title: string;
	/** URL ya resuelta; sin ella la tarjeta pinta la portada generada. */
	coverUrl: string | null;
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
	progressPercent: number;
	contentCompletedAt: Date | null;
	/** `null` si todavía no se pasó lista en esa sesión. */
	marks: Record<string, boolean | null>;
}

export interface TeachingDetail {
	course: {
		documentId: string;
		title: string;
		dependencyName: string;
		modality: CourseModality;
		format: CourseFormat;
		completionRule: CourseCompletionRule;
		status: CourseStatus;
		minAttendance: number;
		requiresEvaluation: boolean;
		finishedAt: Date | null;
		finishOpensAt: Date | null;
		enrollmentClosedAt: Date | null;
		trainers: TeachingPerson[];
	};
	/** Solo para quien puede escribir: el QR es una credencial, no un adorno. */
	qr: TeachingQrView | null;
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
		/** Abrir o cerrar las inscripciones de un autogestivo publicado. */
		toggleEnrollment: boolean;
		/** Quien mira también administra el curso, y el curso aún se edita. */
		editCourse: boolean;
	};
}

export interface TeachingQrView {
	/** Nulo mientras nadie lo genere: la ficha ofrece "Generar código QR". */
	token: string | null;
	rotatedAt: Date | null;
	opensBeforeMinutes: number;
	closesAfterMinutes: number;
}

export interface TeachingWriteResult {
	affected: number;
}

export interface FinishResult {
	completed: number;
	credits: number;
}

export interface CompletionSyncResult {
	completed: number;
	diff: CreditDiff;
}

export type TeachingCourseListResponse = AppResponse<TeachingCourseSummary[]>;
export type TeachingDetailResponse = AppResponse<TeachingDetail>;
export type TeachingWriteResponse = AppResponse<TeachingWriteResult>;
export type FinishResponse = AppResponse<FinishResult>;
