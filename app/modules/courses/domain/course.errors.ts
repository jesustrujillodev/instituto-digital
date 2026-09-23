// Errores de dominio del módulo de cursos — agnósticos al framework.

import { DomainError } from "@/shared/errors/domain-error";
import type {
	CourseCompletionRule,
	CourseFormat,
	CourseStatus,
} from "./course.rules";

export const COURSE_ERROR_CODES = {
	NOT_FOUND: "COURSE_NOT_FOUND",
	FORBIDDEN_SCOPE: "COURSE_FORBIDDEN_SCOPE",
	ORGANIZER_REQUIRED: "COURSE_ORGANIZER_REQUIRED",
	DEPENDENCY_INACTIVE: "COURSE_DEPENDENCY_INACTIVE",
	NOT_EDITABLE: "COURSE_NOT_EDITABLE",
	FORMAT_LOCKED: "COURSE_FORMAT_LOCKED",
	INCOMPATIBLE_COMPLETION_RULE: "COURSE_INCOMPATIBLE_COMPLETION_RULE",
	COMPLETION_LOCKED: "COURSE_COMPLETION_LOCKED",
	INVALID_TRANSITION: "COURSE_INVALID_TRANSITION",
	WITHOUT_SESSIONS: "COURSE_WITHOUT_SESSIONS",
	WITHOUT_LESSONS: "COURSE_WITHOUT_LESSONS",
	WITHOUT_QUIZ: "COURSE_WITHOUT_QUIZ",
	WITHOUT_ACTIVE_TRAINER: "COURSE_WITHOUT_ACTIVE_TRAINER",
	SESSION_MISSING_VENUE: "COURSE_SESSION_MISSING_VENUE",
	SESSION_MISSING_LINK: "COURSE_SESSION_MISSING_LINK",
	SESSION_INVALID_RANGE: "COURSE_SESSION_INVALID_RANGE",
	TOO_MANY_SESSIONS: "COURSE_TOO_MANY_SESSIONS",
	DEADLINE_AFTER_START: "COURSE_DEADLINE_AFTER_START",
	AUDIENCE_REQUIRED: "COURSE_AUDIENCE_REQUIRED",
	UNKNOWN_TRAINER: "COURSE_UNKNOWN_TRAINER",
	UNKNOWN_AUDIENCE: "COURSE_UNKNOWN_AUDIENCE",
	CAPACITY_BELOW_ENROLLED: "COURSE_CAPACITY_BELOW_ENROLLED",
	PLAN_LINE_NOT_FOUND: "COURSE_PLAN_LINE_NOT_FOUND",
	COVER_INVALID: "COURSE_COVER_INVALID",
} as const;

export abstract class CourseError extends DomainError {}

/** No existe, o cae fuera del alcance de quien pregunta. */
export class CourseNotFoundError extends CourseError {
	readonly code = COURSE_ERROR_CODES.NOT_FOUND;
	constructor() {
		super("Course not found");
	}
}

/**
 * El actor no administra cursos.
 *
 * Es el participante sin perfil y el capacitador externo: §4 del alcance dice
 * que el externo solo imparte, no crea.
 */
export class CourseForbiddenScopeError extends CourseError {
	readonly code = COURSE_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to manage courses");
	}
}

/**
 * Falta la dependencia organizadora.
 *
 * Solo lo alcanza el superadministrador: los demás la heredan de su alcance y
 * no pueden dejarla sin elegir.
 */
export class CourseOrganizerRequiredError extends CourseError {
	readonly code = COURSE_ERROR_CODES.ORGANIZER_REQUIRED;
	constructor() {
		super("An organizing dependency is required");
	}
}

export class CourseDependencyInactiveError extends CourseError {
	readonly code = COURSE_ERROR_CODES.DEPENDENCY_INACTIVE;
	constructor() {
		super("Dependency is archived");
	}
}

/** Un curso finalizado o cancelado ya no se toca (§6.5). */
export class CourseNotEditableError extends CourseError {
	readonly code = COURSE_ERROR_CODES.NOT_EDITABLE;
	readonly details: { status: CourseStatus };
	constructor(status: CourseStatus) {
		super(`Course in status ${status} cannot be edited`);
		this.details = { status };
	}
}

export class CourseInvalidTransitionError extends CourseError {
	readonly code = COURSE_ERROR_CODES.INVALID_TRANSITION;
	readonly details: { from: CourseStatus; to: CourseStatus };
	constructor(from: CourseStatus, to: CourseStatus) {
		super(`Cannot move a course from ${from} to ${to}`);
		this.details = { from, to };
	}
}

/** El formato solo se elige en borrador (docs/adr/0011). */
export class CourseFormatLockedError extends CourseError {
	readonly code = COURSE_ERROR_CODES.FORMAT_LOCKED;
	constructor() {
		super("The course format can only change while the course is a draft");
	}
}

// Las dos partes de la combinación viajan en `details`: el adaptador necesita
// decir cuál de las dos hay que cambiar.
export class CourseIncompatibleCompletionRuleError extends CourseError {
	readonly code = COURSE_ERROR_CODES.INCOMPATIBLE_COMPLETION_RULE;
	readonly details: {
		format: CourseFormat;
		completionRule: CourseCompletionRule;
	};
	constructor(format: CourseFormat, completionRule: CourseCompletionRule) {
		super(`Format ${format} cannot be completed by ${completionRule}`);
		this.details = { format, completionRule };
	}
}

/** La regla y la evaluación de un autogestivo publicado (docs/adr/0014). */
export class CourseCompletionLockedError extends CourseError {
	readonly code = COURSE_ERROR_CODES.COMPLETION_LOCKED;
	constructor() {
		super("A published self-paced course cannot change how it is completed");
	}
}

export class CourseWithoutSessionsError extends CourseError {
	readonly code = COURSE_ERROR_CODES.WITHOUT_SESSIONS;
	constructor() {
		super("A published course needs at least one session");
	}
}

/** Evaluar por examen sin examen dejaría a todo inscrito en pendiente (docs/adr/0015). */
export class CourseWithoutQuizError extends CourseError {
	readonly code = COURSE_ERROR_CODES.WITHOUT_QUIZ;
	constructor() {
		super("A course evaluated by quiz needs a quiz with at least one question");
	}
}

/** El equivalente del autogestivo: sin temario nadie tendría qué recorrer. */
export class CourseWithoutLessonsError extends CourseError {
	readonly code = COURSE_ERROR_CODES.WITHOUT_LESSONS;
	constructor() {
		super("A published self-paced course needs at least one lesson");
	}
}

/**
 * Ninguno de los capacitadores asignados tiene el perfil activo.
 *
 * Se comprueba al publicar y no al asignar: desactivar un perfil no puede
 * deshacer una asignación ya hecha, porque eso borraría el historial de lo
 * impartido.
 */
export class CourseWithoutActiveTrainerError extends CourseError {
	readonly code = COURSE_ERROR_CODES.WITHOUT_ACTIVE_TRAINER;
	constructor() {
		super("A published course needs at least one active trainer");
	}
}

// El número de sesión viaja en `details` para que el adaptador pueda decir CUÁL
// falta, que es lo único accionable del mensaje.
export class CourseSessionMissingVenueError extends CourseError {
	readonly code = COURSE_ERROR_CODES.SESSION_MISSING_VENUE;
	readonly details: { sessionNumber: number };
	constructor(sessionNumber: number) {
		super(`Session ${sessionNumber} is missing its venue`);
		this.details = { sessionNumber };
	}
}

export class CourseSessionMissingLinkError extends CourseError {
	readonly code = COURSE_ERROR_CODES.SESSION_MISSING_LINK;
	readonly details: { sessionNumber: number };
	constructor(sessionNumber: number) {
		super(`Session ${sessionNumber} is missing its link`);
		this.details = { sessionNumber };
	}
}

export class CourseSessionInvalidRangeError extends CourseError {
	readonly code = COURSE_ERROR_CODES.SESSION_INVALID_RANGE;
	readonly details: { sessionNumber: number };
	constructor(sessionNumber: number) {
		super(`Session ${sessionNumber} ends before it starts`);
		this.details = { sessionNumber };
	}
}

export class CourseTooManySessionsError extends CourseError {
	readonly code = COURSE_ERROR_CODES.TOO_MANY_SESSIONS;
	readonly details: { maxSessions: number };
	constructor(maxSessions: number) {
		super(`A course cannot have more than ${maxSessions} sessions`);
		this.details = { maxSessions };
	}
}

/**
 * La fecha límite cae después del inicio de la primera sesión.
 *
 * §6.6 cierra la inscripción en la fecha límite O al empezar la primera sesión,
 * lo que ocurra antes: una límite posterior no significa nada.
 */
export class CourseDeadlineAfterStartError extends CourseError {
	readonly code = COURSE_ERROR_CODES.DEADLINE_AFTER_START;
	constructor() {
		super("Enrollment deadline falls after the first session starts");
	}
}

export class CourseAudienceRequiredError extends CourseError {
	readonly code = COURSE_ERROR_CODES.AUDIENCE_REQUIRED;
	constructor() {
		super("A restricted course needs at least one dependency or group");
	}
}

/**
 * Se pidió asignar a alguien que no es capacitador activo.
 *
 * Se rechaza el lote entero, como el alta de miembros de un grupo: asignar solo
 * a los válidos dejaría un curso silenciosamente incompleto.
 */
export class CourseUnknownTrainerError extends CourseError {
	readonly code = COURSE_ERROR_CODES.UNKNOWN_TRAINER;
	constructor() {
		super("One or more selected trainers are not available");
	}
}

/** Se pidió una dependencia o un grupo que no existe o no está activo. */
export class CourseUnknownAudienceError extends CourseError {
	readonly code = COURSE_ERROR_CODES.UNKNOWN_AUDIENCE;
	constructor() {
		super("One or more selected audiences are not available");
	}
}

/** El cupo nuevo dejaría fuera a personas ya inscritas. */
export class CourseCapacityBelowEnrolledError extends CourseError {
	readonly code = COURSE_ERROR_CODES.CAPACITY_BELOW_ENROLLED;
	readonly details: { enrolled: number };
	constructor(enrolled: number) {
		super(`Capacity cannot be lower than the ${enrolled} enrolled people`);
		this.details = { enrolled };
	}
}

/** La línea del plan no existe o no es de la dependencia que organiza el curso. */
export class CoursePlanLineNotFoundError extends CourseError {
	readonly code = COURSE_ERROR_CODES.PLAN_LINE_NOT_FOUND;
	constructor() {
		super("Plan line not found for this organizer");
	}
}

/**
 * La portada no pasa la allowlist de tipo o el tope de tamaño.
 *
 * Existe como error de dominio —y no se deja escapar el `StorageValidationError`
 * de la transacción— porque aquel no es un `DomainError`: el runner lo
 * registraría como inesperado y el cliente vería un 500 en vez del motivo.
 */
export class CourseCoverInvalidError extends CourseError {
	readonly code = COURSE_ERROR_CODES.COVER_INVALID;
	readonly details: { reason: string };
	constructor(reason: string) {
		super(`Cover image rejected: ${reason}`);
		this.details = { reason };
	}
}
