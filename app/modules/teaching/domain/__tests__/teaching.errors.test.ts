import { describe, expect, test } from "vitest";
import {
	TEACHING_ERROR_CODES,
	TeachingCertificatesNotIssuableError,
	TeachingCorrectionForbiddenError,
	TeachingFinishTooEarlyError,
	TeachingNotSelfPacedError,
	TeachingSelfPacedNotFinishableError,
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
		expect(new TeachingSelfPacedNotFinishableError().code).toBe(
			TEACHING_ERROR_CODES.SELF_PACED_NOT_FINISHABLE,
		);
		expect(new TeachingNotSelfPacedError().code).toBe(
			TEACHING_ERROR_CODES.NOT_SELF_PACED,
		);
		expect(new TeachingCertificatesNotIssuableError().code).toBe(
			TEACHING_ERROR_CODES.CERTIFICATES_NOT_ISSUABLE,
		);
	});

	test("los detalles viajan serializables para redactar el mensaje", () => {
		const opensAt = new Date("2026-09-03T07:00:00.000Z");

		expect(new TeachingFinishTooEarlyError(opensAt).details).toEqual({
			opensAt: "2026-09-03T07:00:00.000Z",
		});
		expect(new TeachingSessionNotStartedError(opensAt).code).toBe(
			TEACHING_ERROR_CODES.SESSION_NOT_STARTED,
		);
	});
});
