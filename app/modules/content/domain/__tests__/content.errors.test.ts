import { describe, expect, test } from "vitest";
import {
	CONTENT_ERROR_CODES,
	ContentClassroomReadOnlyError,
	ContentCourseNotEditableError,
	ContentCourseNotFoundError,
	ContentInvalidOrderError,
	ContentLessonNotFoundError,
	ContentLinkInvalidError,
	ContentMaterialMismatchError,
	ContentModuleNotEmptyError,
	ContentModuleNotFoundError,
	ContentNotEnrolledError,
	ContentTooManyLessonsError,
	ContentTooManyModulesError,
	ContentUploadInvalidError,
	ContentUploadNotFoundError,
	ContentUploadTooLargeError,
} from "../content.errors";

describe("errores de contenido", () => {
	test("cada error expone su código estable", () => {
		expect(new ContentCourseNotFoundError().code).toBe(
			CONTENT_ERROR_CODES.COURSE_NOT_FOUND,
		);
		expect(new ContentNotEnrolledError().code).toBe(
			CONTENT_ERROR_CODES.NOT_ENROLLED,
		);
		expect(new ContentClassroomReadOnlyError().code).toBe(
			CONTENT_ERROR_CODES.CLASSROOM_READ_ONLY,
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

describe("errores del material", () => {
	test("cada uno lleva su código estable y sus detalles", () => {
		expect(new ContentMaterialMismatchError("TEXT", "VIDEO")).toMatchObject({
			code: CONTENT_ERROR_CODES.MATERIAL_MISMATCH,
			details: { expected: "TEXT", received: "VIDEO" },
		});
		expect(new ContentUploadInvalidError("tipo no permitido")).toMatchObject({
			code: CONTENT_ERROR_CODES.UPLOAD_INVALID,
			details: { reason: "tipo no permitido" },
		});
		expect(new ContentUploadNotFoundError().code).toBe(
			CONTENT_ERROR_CODES.UPLOAD_NOT_FOUND,
		);
		expect(new ContentUploadTooLargeError(1024, 2048)).toMatchObject({
			code: CONTENT_ERROR_CODES.UPLOAD_TOO_LARGE,
			details: { limit: 1024, size: 2048 },
		});
		expect(new ContentLinkInvalidError().code).toBe(
			CONTENT_ERROR_CODES.LINK_INVALID,
		);
	});
});
