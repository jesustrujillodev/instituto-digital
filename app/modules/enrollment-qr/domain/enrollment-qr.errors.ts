import { DomainError } from "@/shared/errors/domain-error";

export const ENROLLMENT_QR_ERROR_CODES = {
	INVALID_TOKEN: "ENROLLMENT_QR_INVALID_TOKEN",
	UNAVAILABLE: "ENROLLMENT_QR_UNAVAILABLE",
	NOT_IN_AUDIENCE: "ENROLLMENT_QR_NOT_IN_AUDIENCE",
	RATE_LIMITED: "ENROLLMENT_QR_RATE_LIMITED",
	FORBIDDEN_SCOPE: "ENROLLMENT_QR_FORBIDDEN_SCOPE",
} as const;

export abstract class EnrollmentQrError extends DomainError {}

/**
 * Token mal formado y token inexistente comparten error a propósito: distinguir
 * los dos casos convertiría la ruta en un oráculo de qué tokens existen.
 */
export class EnrollmentQrInvalidTokenError extends EnrollmentQrError {
	readonly code = ENROLLMENT_QR_ERROR_CODES.INVALID_TOKEN;
	constructor() {
		super("Invalid enrollment QR token");
	}
}

/**
 * El curso dejó de admitir inscripción por QR después de imprimirlo: se canceló,
 * finalizó o pasó a ser por invitación.
 */
export class EnrollmentQrUnavailableError extends EnrollmentQrError {
	readonly code = ENROLLMENT_QR_ERROR_CODES.UNAVAILABLE;
	constructor() {
		super("Course does not accept enrollment by QR");
	}
}

/** Curso restringido fuera de la audiencia de quien escanea. No revela el curso. */
export class EnrollmentQrNotInAudienceError extends EnrollmentQrError {
	readonly code = ENROLLMENT_QR_ERROR_CODES.NOT_IN_AUDIENCE;
	constructor() {
		super("Course is not addressed to this user");
	}
}

export class EnrollmentQrRateLimitedError extends EnrollmentQrError {
	readonly code = ENROLLMENT_QR_ERROR_CODES.RATE_LIMITED;
	readonly details: { retryAfterMs: number };
	constructor(retryAfterMs: number) {
		super("Too many enrollment QR attempts");
		this.details = { retryAfterMs };
	}
}

/** Generar el QR exige el mismo alcance que organizar las inscripciones del curso. */
export class EnrollmentQrForbiddenScopeError extends EnrollmentQrError {
	readonly code = ENROLLMENT_QR_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to manage this course enrollment QR code");
	}
}
