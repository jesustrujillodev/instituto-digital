import { describe, expect, test } from "vitest";
import { DomainError } from "@/shared/errors/domain-error";
import {
	CHECK_IN_ERROR_CODES,
	CheckInCourseNotOpenError,
	CheckInForbiddenScopeError,
	CheckInInvalidTokenError,
	CheckInInvitationPendingError,
	CheckInNotEnrolledError,
	CheckInRateLimitedError,
	CheckInSessionClosedError,
	CheckInSessionNotOpenError,
	CheckInWithoutSessionsError,
} from "../check-in.errors";

// El `code` es el contrato estable; el `message` es copia de UI y no se compara.
describe("códigos", () => {
	test.each([
		[new CheckInInvalidTokenError(), CHECK_IN_ERROR_CODES.INVALID_TOKEN],
		[new CheckInCourseNotOpenError(), CHECK_IN_ERROR_CODES.COURSE_NOT_OPEN],
		[new CheckInNotEnrolledError(), CHECK_IN_ERROR_CODES.NOT_ENROLLED],
		[
			new CheckInInvitationPendingError("c"),
			CHECK_IN_ERROR_CODES.INVITATION_PENDING,
		],
		[new CheckInWithoutSessionsError(), CHECK_IN_ERROR_CODES.WITHOUT_SESSIONS],
		[
			new CheckInSessionNotOpenError({
				opensAt: new Date(0),
				closesAt: new Date(0),
			}),
			CHECK_IN_ERROR_CODES.SESSION_NOT_OPEN,
		],
		[
			new CheckInSessionClosedError({
				opensAt: new Date(0),
				closesAt: new Date(0),
			}),
			CHECK_IN_ERROR_CODES.SESSION_CLOSED,
		],
		[new CheckInRateLimitedError(1000), CHECK_IN_ERROR_CODES.RATE_LIMITED],
		[new CheckInForbiddenScopeError(), CHECK_IN_ERROR_CODES.FORBIDDEN_SCOPE],
	])("%#", (error, code) => {
		expect(error.code).toBe(code);
		expect(error).toBeInstanceOf(DomainError);
	});
});

describe("details", () => {
	// Los dos extremos, no solo el que falta: la copia describe el rango entero.
	test("las fechas viajan como ISO, serializables en el envelope", () => {
		const window = {
			opensAt: new Date("2026-09-01T16:45:00.000Z"),
			closesAt: new Date("2026-09-01T19:15:00.000Z"),
		};
		const range = {
			opensAt: "2026-09-01T16:45:00.000Z",
			closesAt: "2026-09-01T19:15:00.000Z",
		};

		expect(new CheckInSessionNotOpenError(window).details).toEqual(range);
		expect(new CheckInSessionClosedError(window).details).toEqual(range);
	});

	test("la invitación pendiente lleva el curso para poder enlazarla", () => {
		expect(new CheckInInvitationPendingError("curso-1").details).toEqual({
			courseDocumentId: "curso-1",
		});
	});

	test("el rate limit lleva cuánto esperar", () => {
		expect(new CheckInRateLimitedError(5000).details).toEqual({
			retryAfterMs: 5000,
		});
	});
});
