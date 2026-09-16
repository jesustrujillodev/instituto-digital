import type * as v from "valibot";
import type {
	CourseAccessType,
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
	modality: CourseModality;
	access: CourseAccessType;
	status: CourseStatus;
	capacity: number | null;
	enrolledCount: number;
	enrollmentDeadline: Date | null;
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

export interface AvailableCourse {
	documentId: string;
	title: string;
	dependencyName: string;
	modality: CourseModality;
	access: CourseAccessType;
	capacity: number | null;
	seatsLeft: number | null;
	closesAt: Date | null;
	firstSessionAt: Date | null;
	sessionCount: number;
	myStatus: EnrollmentStatus | null;
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

export interface CourseRoster {
	course: EnrollmentCourse & {
		seatsLeft: number | null;
		closesAt: Date | null;
		isOpen: boolean;
	};
	entries: RosterEntry[];
}

export interface ParticipantCandidate {
	documentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	dependencyName: string;
}

export interface InviteGroupOption {
	documentId: string;
	name: string;
	dependencyName: string;
	memberCount: number;
}

export interface RosterOptions {
	candidates: ParticipantCandidate[];
	groups: InviteGroupOption[];
}

export interface BatchResult {
	affected: number;
	skipped: number;
}

// ── Lo que el repositorio lee y escribe ───────────────────────────────────────

export interface StoredEnrollment extends OwnEnrollment {
	userId: number;
}

export type EnrollmentState = Pick<
	StoredEnrollment,
	"userId" | "status" | "origin"
>;

export interface ParticipantAccount {
	id: number;
	documentId: string;
	dependencyId: number;
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

export type AvailableCourseListResponse = AppResponse<AvailableCourse[]>;
export type AvailableCourseDetailResponse = AppResponse<AvailableCourseDetail>;
export type MyCoursesResponse = AppResponse<MyCourses>;
export type CourseRosterResponse = AppResponse<CourseRoster>;
export type RosterOptionsResponse = AppResponse<RosterOptions>;
export type ParticipantCandidatesResponse = AppResponse<ParticipantCandidate[]>;
export type EnrollmentMutationResponse = AppResponse<null>;
export type BatchResultResponse = AppResponse<BatchResult>;
