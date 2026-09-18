import { DomainError } from "@/shared/errors/domain-error";

export const CHECK_IN_ERROR_CODES = {
	INVALID_TOKEN: "CHECK_IN_INVALID_TOKEN",
	COURSE_NOT_OPEN: "CHECK_IN_COURSE_NOT_OPEN",
	NOT_ENROLLED: "CHECK_IN_NOT_ENROLLED",
	INVITATION_PENDING: "CHECK_IN_INVITATION_PENDING",
	WITHOUT_SESSIONS: "CHECK_IN_WITHOUT_SESSIONS",
	SESSION_NOT_OPEN: "CHECK_IN_SESSION_NOT_OPEN",
	SESSION_CLOSED: "CHECK_IN_SESSION_CLOSED",
	RATE_LIMITED: "CHECK_IN_RATE_LIMITED",
	FORBIDDEN_SCOPE: "CHECK_IN_FORBIDDEN_SCOPE",
} as const;

export abstract class CheckInError extends DomainError {}

/**
 * Token mal formado y token inexistente comparten error a propósito: distinguir
 * los dos casos convertiría la ruta en un oráculo de qué tokens existen.
 */
export class CheckInInvalidTokenError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.INVALID_TOKEN;
	constructor() {
		super("Invalid check-in token");
	}
}

/** Solo un curso publicado admite escaneos: en uno finalizado movería créditos. */
export class CheckInCourseNotOpenError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.COURSE_NOT_OPEN;
	constructor() {
		super("Course is not open for check-in");
	}
}

export class CheckInNotEnrolledError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.NOT_ENROLLED;
	constructor() {
		super("Not enrolled in this course");
	}
}

/** Invitado que nunca aceptó: se le enlaza la invitación, no se le inscribe. */
export class CheckInInvitationPendingError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.INVITATION_PENDING;
	readonly details: { courseDocumentId: string };
	constructor(courseDocumentId: string) {
		super("The invitation to this course is still pending");
		this.details = { courseDocumentId };
	}
}

export class CheckInWithoutSessionsError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.WITHOUT_SESSIONS;
	constructor() {
		super("Course has no sessions");
	}
}

export class CheckInSessionNotOpenError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.SESSION_NOT_OPEN;
	readonly details: { opensAt: string };
	constructor(opensAt: Date) {
		super("Check-in for the next session has not opened yet");
		this.details = { opensAt: opensAt.toISOString() };
	}
}

export class CheckInSessionClosedError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.SESSION_CLOSED;
	readonly details: { closedAt: string };
	constructor(closedAt: Date) {
		super("Check-in for the last session is already closed");
		this.details = { closedAt: closedAt.toISOString() };
	}
}

export class CheckInRateLimitedError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.RATE_LIMITED;
	readonly details: { retryAfterMs: number };
	constructor(retryAfterMs: number) {
		super("Too many check-in attempts");
		this.details = { retryAfterMs };
	}
}

/** Rotar el token exige el mismo alcance que pasar lista en el curso. */
export class CheckInForbiddenScopeError extends CheckInError {
	readonly code = CHECK_IN_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to manage this course QR code");
	}
}
