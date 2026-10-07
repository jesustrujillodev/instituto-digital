import type {
	CourseCompletionRule,
	CourseFormat,
	CourseModality,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentCourseSession } from "./enrollment.types";

/** Un curso propio tal como lo nombra el panel de inicio. */
export interface MyCourseDigestItem {
	courseDocumentId: string;
	title: string;
	dependencyName: string;
	modality: CourseModality;
	format: CourseFormat;
}

/** Cuántas asistencias faltan y si todavía alcanzan con las sesiones que quedan. */
export interface AttendanceOutlook {
	attended: number;
	needed: number;
	remaining: number;
	reachable: boolean;
}

export interface MyCourseInProgress extends MyCourseDigestItem {
	completionRule: CourseCompletionRule;
	progressPercent: number;
	sessionCount: number;
	nextSession: EnrollmentCourseSession | null;
	/** `null` cuando la asistencia no cuenta para acreditar. */
	attendance: AttendanceOutlook | null;
}

export interface MyCourseInvitation extends MyCourseDigestItem {
	closesAt: Date | null;
	closesSoon: boolean;
	firstSessionAt: Date | null;
}

export interface MyCourseUpcoming extends MyCourseDigestItem {
	firstSessionAt: Date | null;
	daysToStart: number | null;
}

export interface MyCoursesDigest {
	invitations: MyCourseInvitation[];
	inProgress: MyCourseInProgress[];
	upcoming: MyCourseUpcoming[];
	toRate: MyCourseDigestItem[];
	/** Los totales antes de recortar, para el «y N más». */
	counts: {
		invitations: number;
		inProgress: number;
		upcoming: number;
		toRate: number;
		finished: number;
	};
}

export interface MyCoursesDigestLimits {
	invitations: number;
	inProgress: number;
	upcoming: number;
	toRate: number;
}

/** Un curso con la inscripción abierta, visto por quien lo organiza. */
export interface OpenEnrollmentRow {
	documentId: string;
	title: string;
	format: CourseFormat;
	capacity: number | null;
	enrolled: number;
	invited: number;
	closesAt: Date | null;
	firstSessionAt: Date | null;
	closesSoon: boolean;
	/** Días naturales, en la zona del instituto, hasta la primera sesión. */
	startsInDays: number | null;
	/** Arranca pronto con pocos inscritos. */
	lowEnrollment: boolean;
}

/** Lo que el repositorio lee de un curso con la inscripción abierta. */
export interface OpenEnrollmentRecord {
	id: number;
	documentId: string;
	title: string;
	format: CourseFormat;
	capacity: number | null;
	enrollmentDeadline: Date | null;
	firstSessionAt: Date | null;
	enrolled: number;
}

export interface OpenEnrollmentSummary {
	courses: OpenEnrollmentRow[];
	total: number;
}
