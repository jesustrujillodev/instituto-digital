import { DomainError } from "@/shared/errors/domain-error";

export const TEACHING_ERROR_CODES = {
	FORBIDDEN_SCOPE: "TEACHING_FORBIDDEN_SCOPE",
	COURSE_NOT_FOUND: "TEACHING_COURSE_NOT_FOUND",
	SESSION_NOT_FOUND: "TEACHING_SESSION_NOT_FOUND",
	SESSION_NOT_STARTED: "TEACHING_SESSION_NOT_STARTED",
	UNKNOWN_PARTICIPANT: "TEACHING_UNKNOWN_PARTICIPANT",
	EVALUATION_NOT_REQUIRED: "TEACHING_EVALUATION_NOT_REQUIRED",
	CORRECTION_FORBIDDEN: "TEACHING_CORRECTION_FORBIDDEN",
	NOT_PUBLISHED: "TEACHING_NOT_PUBLISHED",
	WITHOUT_SESSIONS: "TEACHING_WITHOUT_SESSIONS",
	FINISH_TOO_EARLY: "TEACHING_FINISH_TOO_EARLY",
	PENDING_RESULTS: "TEACHING_PENDING_RESULTS",
	STATE_CHANGED: "TEACHING_STATE_CHANGED",
	SELF_PACED_NOT_FINISHABLE: "TEACHING_SELF_PACED_NOT_FINISHABLE",
	NOT_SELF_PACED: "TEACHING_NOT_SELF_PACED",
	RESULTS_BY_QUIZ: "TEACHING_RESULTS_BY_QUIZ",
	CERTIFICATES_NOT_ISSUABLE: "TEACHING_CERTIFICATES_NOT_ISSUABLE",
} as const;

export abstract class TeachingError extends DomainError {}

/** No imparte, no organiza y no tiene alcance global. */
export class TeachingForbiddenScopeError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to teach courses");
	}
}

/** No existe, no está publicado ni finalizado, o cae fuera del alcance. */
export class TeachingCourseNotFoundError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.COURSE_NOT_FOUND;
	constructor() {
		super("Course not found");
	}
}

export class TeachingSessionNotFoundError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.SESSION_NOT_FOUND;
	constructor() {
		super("Session not found in this course");
	}
}

export class TeachingSessionNotStartedError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.SESSION_NOT_STARTED;
	readonly details: { opensAt: string };
	constructor(opensAt: Date) {
		super("Attendance opens on the day of the session");
		this.details = { opensAt: opensAt.toISOString() };
	}
}

/** Se rechaza el envío entero si alguna persona no está inscrita. */
export class TeachingUnknownParticipantError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.UNKNOWN_PARTICIPANT;
	constructor() {
		super("One or more people are not enrolled in this course");
	}
}

export class TeachingEvaluationNotRequiredError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.EVALUATION_NOT_REQUIRED;
	constructor() {
		super("This course does not require evaluation");
	}
}

/** Un curso finalizado solo lo corrigen el titular, un auxiliar o el superadministrador (§3). */
export class TeachingCorrectionForbiddenError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.CORRECTION_FORBIDDEN;
	constructor() {
		super("Only dependency managers can correct a finished course");
	}
}

export class TeachingNotPublishedError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.NOT_PUBLISHED;
	constructor() {
		super("Only a published course can be finished");
	}
}

export class TeachingWithoutSessionsError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.WITHOUT_SESSIONS;
	constructor() {
		super("The course has no sessions");
	}
}

export class TeachingFinishTooEarlyError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.FINISH_TOO_EARLY;
	readonly details: { opensAt: string };
	constructor(opensAt: Date) {
		super("The course can be finished from the day of its last session");
		this.details = { opensAt: opensAt.toISOString() };
	}
}

export class TeachingPendingResultsError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.PENDING_RESULTS;
	readonly details: { pending: number };
	constructor(pending: number) {
		super("Some participants still have a pending result");
		this.details = { pending };
	}
}

/** Un autogestivo no se cierra: cada quien lo completa (docs/adr/0014). */
export class TeachingSelfPacedNotFinishableError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.SELF_PACED_NOT_FINISHABLE;
	constructor() {
		super("A self-paced course is never finished");
	}
}

/** Abrir y cerrar inscripciones a mano es el cierre del autogestivo, no de otro. */
export class TeachingNotSelfPacedError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.NOT_SELF_PACED;
	constructor() {
		super("Only a self-paced course opens and closes its enrollment by hand");
	}
}

/** Con examen en línea, el resultado lo escribe el examen (docs/adr/0015). */
export class TeachingResultsByQuizError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.RESULTS_BY_QUIZ;
	constructor() {
		super("Results of a course evaluated by quiz come from the quiz");
	}
}

/** Otra petición cambió el curso entre la lectura y la escritura. */
export class TeachingStateChangedError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.STATE_CHANGED;
	constructor() {
		super("Course changed concurrently");
	}
}

/**
 * Emitir a demanda solo tiene sentido donde el completado ya está decidido: un
 * finalizado o un autogestivo publicado. Uno por impartir se emite al cerrarse.
 */
export class TeachingCertificatesNotIssuableError extends TeachingError {
	readonly code = TEACHING_ERROR_CODES.CERTIFICATES_NOT_ISSUABLE;
	constructor() {
		super("Certificates are issued when the course is finished");
	}
}
