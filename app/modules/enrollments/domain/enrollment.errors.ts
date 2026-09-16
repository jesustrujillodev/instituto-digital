import { DomainError } from "@/shared/errors/domain-error";

export const ENROLLMENT_ERROR_CODES = {
	COURSE_NOT_FOUND: "ENROLLMENT_COURSE_NOT_FOUND",
	NOT_ELIGIBLE: "ENROLLMENT_NOT_ELIGIBLE",
	CLOSED: "ENROLLMENT_CLOSED",
	FULL: "ENROLLMENT_FULL",
	ALREADY_ENROLLED: "ENROLLMENT_ALREADY_ENROLLED",
	NOT_ENROLLED: "ENROLLMENT_NOT_ENROLLED",
	WITHDRAW_CLOSED: "ENROLLMENT_WITHDRAW_CLOSED",
	INVITATION_NOT_FOUND: "ENROLLMENT_INVITATION_NOT_FOUND",
	FORBIDDEN_SCOPE: "ENROLLMENT_FORBIDDEN_SCOPE",
	UNKNOWN_PARTICIPANT: "ENROLLMENT_UNKNOWN_PARTICIPANT",
	UNKNOWN_GROUP: "ENROLLMENT_UNKNOWN_GROUP",
	STATE_CHANGED: "ENROLLMENT_STATE_CHANGED",
} as const;

export abstract class EnrollmentError extends DomainError {}

/** No existe, o quien pregunta no puede verlo. */
export class EnrollmentCourseNotFoundError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.COURSE_NOT_FOUND;
	constructor() {
		super("Course not found");
	}
}

/** Externos y cuentas globales no se inscriben (§6.6). */
export class EnrollmentNotEligibleError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.NOT_ELIGIBLE;
	constructor() {
		super("Account cannot enroll in courses");
	}
}

export class EnrollmentClosedError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.CLOSED;
	readonly details: { closesAt: string | null };
	constructor(closesAt: Date | null) {
		super("Enrollment is closed");
		this.details = { closesAt: closesAt?.toISOString() ?? null };
	}
}

export class EnrollmentFullError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.FULL;
	readonly details: { seatsLeft: number };
	constructor(seatsLeft: number) {
		super("Not enough seats left");
		this.details = { seatsLeft };
	}
}

export class EnrollmentAlreadyEnrolledError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.ALREADY_ENROLLED;
	constructor() {
		super("Already enrolled");
	}
}

export class EnrollmentNotEnrolledError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.NOT_ENROLLED;
	constructor() {
		super("Not enrolled");
	}
}

export class EnrollmentWithdrawClosedError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.WITHDRAW_CLOSED;
	constructor() {
		super("Withdrawal closes when the first session starts");
	}
}

export class EnrollmentInvitationNotFoundError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.INVITATION_NOT_FOUND;
	constructor() {
		super("No pending invitation");
	}
}

export class EnrollmentForbiddenScopeError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to manage enrollments");
	}
}

/** Se rechaza el lote entero si alguna persona no es elegible. */
export class EnrollmentUnknownParticipantError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.UNKNOWN_PARTICIPANT;
	constructor() {
		super("One or more selected people are not eligible");
	}
}

export class EnrollmentUnknownGroupError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.UNKNOWN_GROUP;
	constructor() {
		super("One or more selected groups are not available");
	}
}

/** Otra petición cambió la inscripción entre la lectura y la escritura. */
export class EnrollmentStateChangedError extends EnrollmentError {
	readonly code = ENROLLMENT_ERROR_CODES.STATE_CHANGED;
	constructor() {
		super("Enrollment changed concurrently");
	}
}
