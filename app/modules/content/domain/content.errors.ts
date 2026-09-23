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
	MATERIAL_MISMATCH: "CONTENT_MATERIAL_MISMATCH",
	UPLOAD_INVALID: "CONTENT_UPLOAD_INVALID",
	UPLOAD_NOT_FOUND: "CONTENT_UPLOAD_NOT_FOUND",
	UPLOAD_TOO_LARGE: "CONTENT_UPLOAD_TOO_LARGE",
	LINK_INVALID: "CONTENT_LINK_INVALID",
	NOT_ENROLLED: "CONTENT_NOT_ENROLLED",
	CLASSROOM_READ_ONLY: "CONTENT_CLASSROOM_READ_ONLY",
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

/** El material que llega no es de la clase que declara la lección. */
export class ContentMaterialMismatchError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.MATERIAL_MISMATCH;
	readonly details: { expected: string; received: string };
	constructor(expected: string, received: string) {
		super("Material does not match the lesson type");
		this.details = { expected, received };
	}
}

/** Tipo o tamaño fuera de lo permitido, comprobado ANTES de firmar la subida. */
export class ContentUploadInvalidError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.UPLOAD_INVALID;
	readonly details: { reason: string };
	constructor(reason: string) {
		super("Upload rejected by validation");
		this.details = { reason };
	}
}

/** Se confirma una key que el bucket no tiene: la subida nunca llegó. */
export class ContentUploadNotFoundError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.UPLOAD_NOT_FOUND;
	constructor() {
		super("Uploaded object not found in storage");
	}
}

/**
 * El control que la firma no puede dar: una URL firmada de `PUT` fija el tipo
 * pero no el tamaño, así que el tope solo existe si se comprueba al confirmar.
 */
export class ContentUploadTooLargeError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.UPLOAD_TOO_LARGE;
	readonly details: { limit: number; size: number };
	constructor(limit: number, size: number) {
		super("Uploaded object exceeds the allowed size");
		this.details = { limit, size };
	}
}

/** Solo http(s): un `javascript:` guardado es una inyección con fecha diferida. */
export class ContentLinkInvalidError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.LINK_INVALID;
	constructor() {
		super("External link must be http or https");
	}
}

/** El aula es de quien está inscrito: el avance se impone en el servidor. */
export class ContentNotEnrolledError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.NOT_ENROLLED;
	constructor() {
		super("Only an active enrollment can open the classroom");
	}
}

/** Un curso finalizado se sigue leyendo, pero ya no registra avance. */
export class ContentClassroomReadOnlyError extends ContentError {
	readonly code = CONTENT_ERROR_CODES.CLASSROOM_READ_ONLY;
	constructor() {
		super("The course no longer records progress");
	}
}
