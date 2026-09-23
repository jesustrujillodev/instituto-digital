import type * as v from "valibot";
import type {
	CourseAccessType,
	CourseCompletionRule,
	CourseFormat,
	CourseModality,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	EnrollmentOrigin,
	EnrollmentResult,
	EnrollmentStatus,
} from "./enrollment.config";
import type {
	assignParticipantsRule,
	inviteParticipantsRule,
	listAvailableCoursesRule,
} from "./enrollment.rules";

export type ListAvailableCoursesDto = v.InferInput<
	typeof listAvailableCoursesRule
>;
export type AssignParticipantsDto = v.InferInput<typeof assignParticipantsRule>;
export type InviteParticipantsDto = v.InferInput<typeof inviteParticipantsRule>;

// ── Proyecciones ──────────────────────────────────────────────────────────────

export interface EnrollmentCourseSession {
	documentId: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
}

export interface EnrollmentCourseTrainer {
	firstName: string | null;
	lastName: string | null;
	email: string;
}

/** El curso tal como lo necesita la inscripción para decidir y para pintarse. */
export interface EnrollmentCourse {
	id: number;
	documentId: string;
	dependencyName: string;
	title: string;
	description: string | null;
	/** Ya resuelta a la URL con la que se pinta (CDN o proxy), o null. */
	coverUrl: string | null;
	modality: CourseModality;
	format: CourseFormat;
	completionRule: CourseCompletionRule;
	access: CourseAccessType;
	status: CourseStatus;
	capacity: number | null;
	enrolledCount: number;
	enrollmentDeadline: Date | null;
	/** El interruptor del autogestivo: con valor, no entra nadie nuevo. */
	enrollmentClosedAt: Date | null;
	finishedAt: Date | null;
	/** Ordenadas por inicio. */
	sessions: EnrollmentCourseSession[];
	trainers: EnrollmentCourseTrainer[];
	firstSessionAt: Date | null;
	lastSessionEndsAt: Date | null;
}

export interface OwnEnrollment {
	documentId: string;
	origin: EnrollmentOrigin;
	status: EnrollmentStatus;
	result: EnrollmentResult;
}

/** El curso tal como lo pinta una tarjeta del catálogo. */
export interface AvailableCourse {
	documentId: string;
	title: string;
	description: string | null;
	coverUrl: string | null;
	dependencyName: string;
	modality: CourseModality;
	format: CourseFormat;
	access: CourseAccessType;
	capacity: number | null;
	seatsLeft: number | null;
	closesAt: Date | null;
	/** Lo decide el reloj del servidor, no el del navegador. */
	closesSoon: boolean;
	firstSessionAt: Date | null;
	sessionCount: number;
	/** Quién lo imparte: el primero por nombre, y cuántos más hay. */
	trainerName: string | null;
	trainerCount: number;
	myStatus: EnrollmentStatus | null;
}

/** Dependencia que organiza al menos un curso visible: opción del filtro. */
export interface CourseOrganizerOption {
	documentId: string;
	name: string;
}

/** Lo que devuelve el catálogo: la página y las opciones de su filtro. */
export interface AvailableCourseList {
	courses: AvailableCourse[];
	organizers: CourseOrganizerOption[];
}

export interface EnrollmentPermissions {
	enroll: boolean;
	withdraw: boolean;
	accept: boolean;
	decline: boolean;
	assign: boolean;
}

export interface AvailableCourseDetail {
	course: EnrollmentCourse & {
		seatsLeft: number | null;
		closesAt: Date | null;
		isOpen: boolean;
	};
	enrollment: OwnEnrollment | null;
	can: EnrollmentPermissions;
}

/** Cómo le fue a la persona en el curso (§6.8–6.10). */
export interface MyCourseOutcome {
	grade: number | null;
	completed: boolean;
	/** Caché del avance por lección (docs/adr/0014). */
	progressPercent: number;
	contentCompletedAt: Date | null;
	attendedSessions: number;
	/** Su puntuación si ya valoró; los comentarios no vuelven a la persona. */
	myRating: number | null;
}

export interface MyCourseRecord {
	enrollment: OwnEnrollment;
	course: EnrollmentCourse;
	outcome: MyCourseOutcome;
}

export interface MyCourseEntry extends MyCourseRecord {
	canRate: boolean;
}

export interface MyCourses {
	invitations: MyCourseEntry[];
	upcoming: MyCourseEntry[];
	inProgress: MyCourseEntry[];
	finished: MyCourseEntry[];
}

export interface RosterEntry {
	documentId: string;
	userDocumentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	/** La dependencia con la que se inscribió, no la actual. */
	dependencyName: string;
	origin: EnrollmentOrigin;
	status: EnrollmentStatus;
	result: EnrollmentResult;
	updatedAt: Date;
}

/** Desde qué lado opera el actor las inscripciones de un curso. */
export interface RosterReach {
	/** Si no organiza, solo ve y mueve al personal de su dependencia. */
	organizer: boolean;
	canInvite: boolean;
}

export interface CourseRoster {
	course: EnrollmentCourse & {
		seatsLeft: number | null;
		closesAt: Date | null;
		isOpen: boolean;
	};
	entries: RosterEntry[];
	reach: RosterReach;
}

export interface ParticipantCandidate {
	documentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	dependencyName: string;
}

export interface CandidateAccount extends ParticipantCandidate {
	dependencyId: number;
}

export interface RosterCandidate extends ParticipantCandidate {
	/** Solo se inscribe directo al personal propio; al resto solo se le invita. */
	assignable: boolean;
}

export interface RosterGroupOption {
	documentId: string;
	name: string;
	dependencyName: string;
	memberCount: number;
	/** Los miembros que ocuparían lugar al inscribir el grupo. */
	enrollableMemberIds: string[];
}

export interface RosterOptions {
	candidates: RosterCandidate[];
	groups: RosterGroupOption[];
}

export interface BatchResult {
	affected: number;
	skipped: number;
}

// ── Lo que el repositorio lee y escribe ───────────────────────────────────────

export interface StoredEnrollment extends OwnEnrollment {
	userId: number;
	completed: boolean;
}

/** El avance cacheado de una inscripción activa, para recalcularlo. */
export interface ProgressState {
	userId: number;
	progressPercent: number;
	contentCompletedAt: Date | null;
}

/** `completedAt` solo se escribe si la inscripción todavía no lo tenía. */
export interface ProgressWrite {
	userId: number;
	percent: number;
	completedAt: Date | null;
}

export type EnrollmentState = Pick<
	StoredEnrollment,
	"userId" | "status" | "origin"
>;

export interface ParticipantAccount {
	id: number;
	documentId: string;
	dependencyId: number;
	email: string;
	firstName: string | null;
	lastName: string | null;
}

/** A quién se avisa de un cambio o una cancelación del curso (§6.12). */
export interface NotifiableParticipant {
	email: string;
	firstName: string | null;
	lastName: string | null;
}

export interface EnrollmentWrite {
	courseId: number;
	userId: number;
	dependencyId: number;
	origin: EnrollmentOrigin;
	status: EnrollmentStatus;
	actedById: number;
	at: Date;
}

/** Resultado capturado en la impartición (§6.8). */
export interface ResultWrite {
	userId: number;
	result: EnrollmentResult;
	grade: number | null;
}

export interface AvailableCourseRow {
	course: EnrollmentCourse;
	myStatus: EnrollmentStatus | null;
}

// ── Contrato de respuesta ─────────────────────────────────────────────────────

export type AvailableCourseListResponse = AppResponse<AvailableCourseList>;
export type AvailableCourseDetailResponse = AppResponse<AvailableCourseDetail>;
export type MyCoursesResponse = AppResponse<MyCourses>;
export type CourseRosterResponse = AppResponse<CourseRoster>;
export type RosterOptionsResponse = AppResponse<RosterOptions>;
export type EnrollmentMutationResponse = AppResponse<null>;
export type BatchResultResponse = AppResponse<BatchResult>;
