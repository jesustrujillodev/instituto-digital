import { describe, expect, test } from "vitest";
import { DomainError } from "@/shared/errors/domain-error";
import {
	ENROLLMENT_QR_ERROR_CODES,
	EnrollmentQrForbiddenScopeError,
	EnrollmentQrInvalidTokenError,
	EnrollmentQrNotInAudienceError,
	EnrollmentQrRateLimitedError,
	EnrollmentQrUnavailableError,
} from "../enrollment-qr.errors";

// El `code` es el contrato estable; el `message` es copia de UI y no se compara.
describe("códigos", () => {
	test.each([
		[
			new EnrollmentQrInvalidTokenError(),
			ENROLLMENT_QR_ERROR_CODES.INVALID_TOKEN,
		],
		[new EnrollmentQrUnavailableError(), ENROLLMENT_QR_ERROR_CODES.UNAVAILABLE],
		[
			new EnrollmentQrNotInAudienceError(),
			ENROLLMENT_QR_ERROR_CODES.NOT_IN_AUDIENCE,
		],
		[
			new EnrollmentQrRateLimitedError(1000),
			ENROLLMENT_QR_ERROR_CODES.RATE_LIMITED,
		],
		[
			new EnrollmentQrForbiddenScopeError(),
			ENROLLMENT_QR_ERROR_CODES.FORBIDDEN_SCOPE,
		],
	])("%#", (error, code) => {
		expect(error.code).toBe(code);
		expect(error).toBeInstanceOf(DomainError);
	});

	test("el rate limit lleva cuánto esperar", () => {
		expect(new EnrollmentQrRateLimitedError(5000).details).toEqual({
			retryAfterMs: 5000,
		});
	});
});
