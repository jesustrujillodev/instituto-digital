import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	COURSE_ERROR_CODES,
	CourseAudienceRequiredError,
	CourseCapacityBelowEnrolledError,
	CourseCompletionLockedError,
	CourseCoverInvalidError,
	CourseDeadlineAfterStartError,
	CourseDependencyInactiveError,
	CourseError,
	CourseForbiddenScopeError,
	CourseFormatLockedError,
	CourseIncompatibleCompletionRuleError,
	CourseIncompatibleEvaluationMethodError,
	CourseInvalidTransitionError,
	CourseNotEditableError,
	CourseNotFoundError,
	CourseOrganizerRequiredError,
	CourseSessionInvalidRangeError,
	CourseSessionMissingLinkError,
	CourseSessionMissingVenueError,
	CourseTooManySessionsError,
	CourseUnknownAudienceError,
	CourseUnknownTrainerError,
	CourseWithoutActiveTrainerError,
	CourseWithoutSessionsError,
} from "../course.errors";

// Se comprueba el `code` y NUNCA el `message`: el código es contrato estable y
// el mensaje es texto que la capa de adaptador traduce para el usuario.
describe("códigos estables", () => {
	test.each([
		[new CourseNotFoundError(), COURSE_ERROR_CODES.NOT_FOUND],
		[
			new CourseCoverInvalidError("tipo no permitido: image/gif"),
			COURSE_ERROR_CODES.COVER_INVALID,
		],
		[new CourseForbiddenScopeError(), COURSE_ERROR_CODES.FORBIDDEN_SCOPE],
		[new CourseOrganizerRequiredError(), COURSE_ERROR_CODES.ORGANIZER_REQUIRED],
		[
			new CourseDependencyInactiveError(),
			COURSE_ERROR_CODES.DEPENDENCY_INACTIVE,
		],
		[new CourseNotEditableError("FINISHED"), COURSE_ERROR_CODES.NOT_EDITABLE],
		[
			new CourseInvalidTransitionError("CANCELLED", "PUBLISHED"),
			COURSE_ERROR_CODES.INVALID_TRANSITION,
		],
		[new CourseWithoutSessionsError(), COURSE_ERROR_CODES.WITHOUT_SESSIONS],
		[new CourseFormatLockedError(), COURSE_ERROR_CODES.FORMAT_LOCKED],
		[
			new CourseIncompatibleCompletionRuleError("SELF_PACED", "ATTENDANCE"),
			COURSE_ERROR_CODES.INCOMPATIBLE_COMPLETION_RULE,
		],
		[
			new CourseIncompatibleEvaluationMethodError("SELF_PACED", "MANUAL"),
			COURSE_ERROR_CODES.INCOMPATIBLE_EVALUATION_METHOD,
		],
		[new CourseCompletionLockedError(), COURSE_ERROR_CODES.COMPLETION_LOCKED],
		[
			new CourseWithoutActiveTrainerError(),
			COURSE_ERROR_CODES.WITHOUT_ACTIVE_TRAINER,
		],
		[
			new CourseSessionMissingVenueError(1),
			COURSE_ERROR_CODES.SESSION_MISSING_VENUE,
		],
		[
			new CourseSessionMissingLinkError(1),
			COURSE_ERROR_CODES.SESSION_MISSING_LINK,
		],
		[
			new CourseSessionInvalidRangeError(1),
			COURSE_ERROR_CODES.SESSION_INVALID_RANGE,
		],
		[new CourseTooManySessionsError(60), COURSE_ERROR_CODES.TOO_MANY_SESSIONS],
		[
			new CourseDeadlineAfterStartError(),
			COURSE_ERROR_CODES.DEADLINE_AFTER_START,
		],
		[new CourseAudienceRequiredError(), COURSE_ERROR_CODES.AUDIENCE_REQUIRED],
		[new CourseUnknownTrainerError(), COURSE_ERROR_CODES.UNKNOWN_TRAINER],
		[new CourseUnknownAudienceError(), COURSE_ERROR_CODES.UNKNOWN_AUDIENCE],
		[
			new CourseCapacityBelowEnrolledError(2),
			COURSE_ERROR_CODES.CAPACITY_BELOW_ENROLLED,
		],
	])("$constructor.name expone su código", (error, code) => {
		expect(error.code).toBe(code);
	});
});

describe("pertenencia a la jerarquía de dominio", () => {
	// `toResponseError` decide con una sola comprobación si el mensaje puede
	// viajar al cliente. Un error que no extienda la base saldría como genérico.
	test("todos extienden DomainError y el error del módulo", () => {
		const error = new CourseNotFoundError();

		expect(isDomainError(error)).toBe(true);
		expect(error).toBeInstanceOf(CourseError);
	});
});

describe("details", () => {
	test("el número de sesión viaja para que el adaptador diga cuál", () => {
		expect(new CourseSessionMissingVenueError(3).details).toEqual({
			sessionNumber: 3,
		});
		expect(new CourseSessionMissingLinkError(2).details).toEqual({
			sessionNumber: 2,
		});
		expect(new CourseSessionInvalidRangeError(1).details).toEqual({
			sessionNumber: 1,
		});
	});

	test("la transición inválida dice desde dónde y hacia dónde", () => {
		expect(
			new CourseInvalidTransitionError("CANCELLED", "PUBLISHED").details,
		).toEqual({ from: "CANCELLED", to: "PUBLISHED" });
	});

	test("el estado que impide editar viaja con el error", () => {
		expect(new CourseNotEditableError("FINISHED").details).toEqual({
			status: "FINISHED",
		});
	});

	test("la combinación incompatible dice cuáles son las dos partes", () => {
		expect(
			new CourseIncompatibleCompletionRuleError("SELF_PACED", "ATTENDANCE")
				.details,
		).toEqual({ format: "SELF_PACED", completionRule: "ATTENDANCE" });
	});

	test("el tope de sesiones viaja para poder nombrarlo", () => {
		expect(new CourseTooManySessionsError(60).details).toEqual({
			maxSessions: 60,
		});
	});
});

describe("CourseCoverInvalidError", () => {
	test("lleva el motivo en `details` para que el adaptador lo interpole", () => {
		const error = new CourseCoverInvalidError(
			"supera el máximo de 5242880 bytes",
		);

		expect(error.details).toEqual({
			reason: "supera el máximo de 5242880 bytes",
		});
		expect(isDomainError(error)).toBe(true);
		expect(error).toBeInstanceOf(CourseError);
	});
});
