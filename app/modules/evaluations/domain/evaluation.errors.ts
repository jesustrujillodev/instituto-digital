import { DomainError } from "@/shared/errors/domain-error";

export const EVALUATION_ERROR_CODES = {
	COURSE_NOT_FOUND: "EVALUATION_COURSE_NOT_FOUND",
	EVALUATION_NOT_FOUND: "EVALUATION_NOT_FOUND",
	SESSION_NOT_FOUND: "EVALUATION_SESSION_NOT_FOUND",
	FORBIDDEN: "EVALUATION_FORBIDDEN",
	UNKNOWN_PARTICIPANT: "EVALUATION_UNKNOWN_PARTICIPANT",
	TOO_MANY: "EVALUATION_TOO_MANY",
	SELF_PACED: "EVALUATION_SELF_PACED",
} as const;

export abstract class EvaluationError extends DomainError {}

/** No existe, o quien pregunta no lo imparte ni lo organiza. */
export class EvaluationCourseNotFoundError extends EvaluationError {
	readonly code = EVALUATION_ERROR_CODES.COURSE_NOT_FOUND;
	constructor() {
		super("Course not found");
	}
}

/** No existe, o no pertenece al curso de la ficha. */
export class EvaluationNotFoundError extends EvaluationError {
	readonly code = EVALUATION_ERROR_CODES.EVALUATION_NOT_FOUND;
	constructor() {
		super("Evaluation not found");
	}
}

/** La sesion elegida no es de este curso. */
export class EvaluationSessionNotFoundError extends EvaluationError {
	readonly code = EVALUATION_ERROR_CODES.SESSION_NOT_FOUND;
	constructor() {
		super("Session not found in this course");
	}
}

/**
 * El curso no admite el cambio: definir exige un curso editable, y capturar en
 * uno finalizado exige poder corregirlo.
 */
export class EvaluationForbiddenError extends EvaluationError {
	readonly code = EVALUATION_ERROR_CODES.FORBIDDEN;
	constructor() {
		super("Cannot write evaluations in this course");
	}
}

/** Alguien del envio ya no esta inscrito: se rechaza el envio entero. */
export class EvaluationUnknownParticipantError extends EvaluationError {
	readonly code = EVALUATION_ERROR_CODES.UNKNOWN_PARTICIPANT;
	constructor() {
		super("Unknown participant in submission");
	}
}

/**
 * Las de seguimiento las captura quien imparte, y un autogestivo no tiene
 * capacitador ni sesiones a las que anclarlas.
 */
export class EvaluationSelfPacedError extends EvaluationError {
	readonly code = EVALUATION_ERROR_CODES.SELF_PACED;
	constructor() {
		super("Self-paced courses have no follow-up evaluations");
	}
}

export class EvaluationTooManyError extends EvaluationError {
	readonly code = EVALUATION_ERROR_CODES.TOO_MANY;
	readonly details: { limit: number };
	constructor(limit: number) {
		super("Too many evaluations in this course");
		this.details = { limit };
	}
}
