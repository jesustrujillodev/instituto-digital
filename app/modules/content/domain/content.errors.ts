import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import { DomainError } from "@/shared/errors/domain-error";

export const CONTENT_ERROR_CODES = {
	COURSE_NOT_FOUND: "CONTENT_COURSE_NOT_FOUND",
	COURSE_NOT_EDITABLE: "CONTENT_COURSE_NOT_EDITABLE",
	MODULE_NOT_FOUND: "CONTENT_MODULE_NOT_FOUND",
	LESSON_NOT_FOUND: "CONTENT_LESSON_NOT_FOUND",
	TOO_MANY_MODULES: "CONTENT_TOO_MANY_MODULES",
	TOO_MANY_LESSONS: "CONTENT_TOO_MANY_LESSONS",
	MODULE_NOT_EMPTY: "CONTENT_MODULE_NOT_EMPTY",
	INVALID_ORDER: "CONTENT_INVALID_ORDER",
} as const;

export abstract class ContentError extends DomainError {}

/** No existe, o quien pregunta no lo organiza ni lo creó. */
export class ContentCourseNotFoundError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.COURSE_NOT_FOUND;
	constructor() {
		super("Course not found");
	}
}

/** Un curso finalizado o cancelado ya no cambia de temario. */
export class ContentCourseNotEditableError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.COURSE_NOT_EDITABLE;
	readonly details: { status: CourseStatus };
	constructor(status: CourseStatus) {
		super("Course content is no longer editable");
		this.details = { status };
	}
}

/** No existe, está archivado, o no pertenece a este curso. */
export class ContentModuleNotFoundError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.MODULE_NOT_FOUND;
	constructor() {
		super("Module not found in this course");
	}
}

/** No existe, está archivada, o no pertenece a este curso. */
export class ContentLessonNotFoundError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.LESSON_NOT_FOUND;
	constructor() {
		super("Lesson not found in this course");
	}
}

export class ContentTooManyModulesError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.TOO_MANY_MODULES;
	readonly details: { limit: number };
	constructor(limit: number) {
		super("Too many modules in this course");
		this.details = { limit };
	}
}

export class ContentTooManyLessonsError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.TOO_MANY_LESSONS;
	readonly details: { limit: number };
	constructor(limit: number) {
		super("Too many lessons in this module");
		this.details = { limit };
	}
}

/** Archivar en cascada escondería lecciones que nadie pidió esconder. */
export class ContentModuleNotEmptyError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.MODULE_NOT_EMPTY;
	readonly details: { activeLessons: number };
	constructor(activeLessons: number) {
		super("Module still has active lessons");
		this.details = { activeLessons };
	}
}

/** El orden recibido no es una permutación del temario guardado. */
export class ContentInvalidOrderError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.INVALID_ORDER;
	constructor() {
		super("Requested order does not match stored content");
	}
}
