import { describe, expect, test } from "vitest";
import {
	EVALUATION_ERROR_CODES,
	EvaluationCourseNotFoundError,
	EvaluationForbiddenError,
	EvaluationNotFoundError,
	EvaluationSelfPacedError,
	EvaluationSessionNotFoundError,
	EvaluationTooManyError,
	EvaluationUnknownParticipantError,
} from "../evaluation.errors";

describe("errores de evaluaciones", () => {
	test("cada error expone su código estable", () => {
		expect(new EvaluationCourseNotFoundError().code).toBe(
			EVALUATION_ERROR_CODES.COURSE_NOT_FOUND,
		);
		expect(new EvaluationNotFoundError().code).toBe(
			EVALUATION_ERROR_CODES.EVALUATION_NOT_FOUND,
		);
		expect(new EvaluationSessionNotFoundError().code).toBe(
			EVALUATION_ERROR_CODES.SESSION_NOT_FOUND,
		);
		expect(new EvaluationForbiddenError().code).toBe(
			EVALUATION_ERROR_CODES.FORBIDDEN,
		);
		expect(new EvaluationUnknownParticipantError().code).toBe(
			EVALUATION_ERROR_CODES.UNKNOWN_PARTICIPANT,
		);
		expect(new EvaluationSelfPacedError().code).toBe(
			EVALUATION_ERROR_CODES.SELF_PACED,
		);
	});

	test("el tope viaja en los detalles para redactar el mensaje", () => {
		expect(new EvaluationTooManyError(20).details).toEqual({ limit: 20 });
	});
});
