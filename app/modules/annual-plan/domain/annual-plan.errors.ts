import { DomainError } from "@/shared/errors/domain-error";

export const ANNUAL_PLAN_ERROR_CODES = {
	FORBIDDEN_SCOPE: "ANNUAL_PLAN_FORBIDDEN_SCOPE",
	NOT_FOUND: "ANNUAL_PLAN_NOT_FOUND",
	LINE_NOT_FOUND: "ANNUAL_PLAN_LINE_NOT_FOUND",
	ALREADY_EXISTS: "ANNUAL_PLAN_ALREADY_EXISTS",
	INVALID_YEAR: "ANNUAL_PLAN_INVALID_YEAR",
	READ_ONLY: "ANNUAL_PLAN_READ_ONLY",
	LINE_CANCELLED: "ANNUAL_PLAN_LINE_CANCELLED",
	LINE_NOT_CANCELLED: "ANNUAL_PLAN_LINE_NOT_CANCELLED",
	LINE_HAS_ACTIVE_COURSE: "ANNUAL_PLAN_LINE_HAS_ACTIVE_COURSE",
	LINE_HAS_COURSES: "ANNUAL_PLAN_LINE_HAS_COURSES",
} as const;

export abstract class AnnualPlanError extends DomainError {}

/** Solo el titular y los auxiliares gestionan el plan de su dependencia (§3). */
export class AnnualPlanForbiddenScopeError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.FORBIDDEN_SCOPE;
	constructor() {
		super("Not allowed to manage annual plans");
	}
}

/** No existe, o cae fuera del alcance de quien pregunta. */
export class AnnualPlanNotFoundError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.NOT_FOUND;
	constructor() {
		super("Annual plan not found");
	}
}

export class AnnualPlanLineNotFoundError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.LINE_NOT_FOUND;
	constructor() {
		super("Plan line not found");
	}
}

export class AnnualPlanAlreadyExistsError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.ALREADY_EXISTS;
	readonly details: { fiscalYear: number };
	constructor(fiscalYear: number) {
		super("The dependency already has a plan for this year");
		this.details = { fiscalYear };
	}
}

/** Un plan no se crea para un ejercicio que ya pasó. */
export class AnnualPlanInvalidYearError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.INVALID_YEAR;
	readonly details: { fiscalYear: number };
	constructor(fiscalYear: number) {
		super("Plans can only be created for the current or a future year");
		this.details = { fiscalYear };
	}
}

/** Los planes de ejercicios anteriores quedan en solo lectura (§6.11). */
export class AnnualPlanReadOnlyError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.READ_ONLY;
	readonly details: { fiscalYear: number };
	constructor(fiscalYear: number) {
		super("Plans of past years are read-only");
		this.details = { fiscalYear };
	}
}

export class AnnualPlanLineCancelledError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.LINE_CANCELLED;
	constructor() {
		super("The plan line is cancelled");
	}
}

export class AnnualPlanLineNotCancelledError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.LINE_NOT_CANCELLED;
	constructor() {
		super("The plan line is not cancelled");
	}
}

/** Cada línea se vincula como máximo a un curso no cancelado (§6.11). */
export class AnnualPlanLineHasActiveCourseError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE;
	constructor() {
		super("The plan line already has an active course");
	}
}

/** Borrar solo corrige capturas: una línea que tuvo curso guarda historial. */
export class AnnualPlanLineHasCoursesError extends AnnualPlanError {
	readonly code = ANNUAL_PLAN_ERROR_CODES.LINE_HAS_COURSES;
	constructor() {
		super("The plan line has linked courses");
	}
}
