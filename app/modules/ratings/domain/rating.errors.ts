import { DomainError } from "@/shared/errors/domain-error";

export const RATING_ERROR_CODES = {
	COURSE_NOT_FOUND: "RATING_COURSE_NOT_FOUND",
	NOT_ELIGIBLE: "RATING_NOT_ELIGIBLE",
	ALREADY_RATED: "RATING_ALREADY_RATED",
} as const;

export abstract class RatingError extends DomainError {}

/** No existe, o quien pregunta no puede ver sus valoraciones. */
export class RatingCourseNotFoundError extends RatingError {
	readonly code = RATING_ERROR_CODES.COURSE_NOT_FOUND;
	constructor() {
		super("Course not found");
	}
}

/** El curso no está finalizado, o la persona no estuvo inscrita o no asistió. */
export class RatingNotEligibleError extends RatingError {
	readonly code = RATING_ERROR_CODES.NOT_ELIGIBLE;
	constructor() {
		super("Not eligible to rate this course");
	}
}

/** Una sola valoración por persona y curso, y no se edita (§6.10). */
export class RatingAlreadyRatedError extends RatingError {
	readonly code = RATING_ERROR_CODES.ALREADY_RATED;
	constructor() {
		super("Course already rated");
	}
}
