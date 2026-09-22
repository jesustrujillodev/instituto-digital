import { describe, expect, test } from "vitest";
import {
	CONTENT_ERROR_CODES,
	ContentCourseNotEditableError,
	ContentCourseNotFoundError,
	ContentInvalidOrderError,
	ContentLessonNotFoundError,
	ContentModuleNotEmptyError,
	ContentModuleNotFoundError,
	ContentTooManyLessonsError,
	ContentTooManyModulesError,
} from "../content.errors";

describe("errores de contenido", () => {
	test("cada error expone su código estable", () => {
		expect(new ContentCourseNotFoundError().code).toBe(
			CONTENT_ERROR_CODES.COURSE_NOT_FOUND,
		);
		expect(new ContentCourseNotEditableError("FINISHED").code).toBe(
			CONTENT_ERROR_CODES.COURSE_NOT_EDITABLE,
		);
		expect(new ContentModuleNotFoundError().code).toBe(
			CONTENT_ERROR_CODES.MODULE_NOT_FOUND,
		);
		expect(new ContentLessonNotFoundError().code).toBe(
			CONTENT_ERROR_CODES.LESSON_NOT_FOUND,
		);
		expect(new ContentTooManyModulesError(30).code).toBe(
			CONTENT_ERROR_CODES.TOO_MANY_MODULES,
		);
		expect(new ContentTooManyLessonsError(50).code).toBe(
			CONTENT_ERROR_CODES.TOO_MANY_LESSONS,
		);
		expect(new ContentModuleNotEmptyError(2).code).toBe(
			CONTENT_ERROR_CODES.MODULE_NOT_EMPTY,
		);
		expect(new ContentInvalidOrderError().code).toBe(
			CONTENT_ERROR_CODES.INVALID_ORDER,
		);
	});

	test("los detalles viajan para redactar el mensaje", () => {
		expect(new ContentTooManyModulesError(30).details).toEqual({ limit: 30 });
		expect(new ContentTooManyLessonsError(50).details).toEqual({ limit: 50 });
		expect(new ContentModuleNotEmptyError(2).details).toEqual({
			activeLessons: 2,
		});
		expect(new ContentCourseNotEditableError("CANCELLED").details).toEqual({
			status: "CANCELLED",
		});
	});
});
