import { describe, expect, test } from "vitest";
import {
	TEACHING_ERROR_CODES,
	TeachingCorrectionForbiddenError,
	TeachingFinishTooEarlyError,
	TeachingPendingResultsError,
	TeachingSessionNotStartedError,
	TeachingStateChangedError,
} from "../teaching.errors";

describe("errores de impartición", () => {
	test("cada error expone su código estable", () => {
		expect(new TeachingCorrectionForbiddenError().code).toBe(
			TEACHING_ERROR_CODES.CORRECTION_FORBIDDEN,
		);
		expect(new TeachingStateChangedError().code).toBe(
			TEACHING_ERROR_CODES.STATE_CHANGED,
		);
	});

	test("los detalles viajan serializables para redactar el mensaje", () => {
		const opensAt = new Date("2026-09-03T07:00:00.000Z");

		expect(new TeachingPendingResultsError(2).details).toEqual({ pending: 2 });
		expect(new TeachingFinishTooEarlyError(opensAt).details).toEqual({
			opensAt: "2026-09-03T07:00:00.000Z",
		});
		expect(new TeachingSessionNotStartedError(opensAt).code).toBe(
			TEACHING_ERROR_CODES.SESSION_NOT_STARTED,
		);
	});
});
