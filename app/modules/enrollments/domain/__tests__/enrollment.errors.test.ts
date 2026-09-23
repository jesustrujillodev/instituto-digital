import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	ENROLLMENT_ERROR_CODES,
	EnrollmentAlreadyEnrolledError,
	EnrollmentClosedError,
	EnrollmentCourseNotFoundError,
	EnrollmentError,
	EnrollmentForbiddenScopeError,
	EnrollmentFullError,
	EnrollmentInvitationNotFoundError,
	EnrollmentInvitationRequiredError,
	EnrollmentInvitationsDisabledError,
	EnrollmentNotEligibleError,
	EnrollmentNotEnrolledError,
	EnrollmentStateChangedError,
	EnrollmentUnknownGroupError,
	EnrollmentUnknownParticipantError,
	EnrollmentWithdrawClosedError,
} from "../enrollment.errors";

describe("códigos estables", () => {
	test.each([
		[
			new EnrollmentCourseNotFoundError(),
			ENROLLMENT_ERROR_CODES.COURSE_NOT_FOUND,
		],
		[new EnrollmentNotEligibleError(), ENROLLMENT_ERROR_CODES.NOT_ELIGIBLE],
		[new EnrollmentClosedError(null), ENROLLMENT_ERROR_CODES.CLOSED],
		[new EnrollmentFullError(0), ENROLLMENT_ERROR_CODES.FULL],
		[
			new EnrollmentAlreadyEnrolledError(),
			ENROLLMENT_ERROR_CODES.ALREADY_ENROLLED,
		],
		[new EnrollmentNotEnrolledError(), ENROLLMENT_ERROR_CODES.NOT_ENROLLED],
		[
			new EnrollmentWithdrawClosedError(),
			ENROLLMENT_ERROR_CODES.WITHDRAW_CLOSED,
		],
		[
			new EnrollmentInvitationNotFoundError(),
			ENROLLMENT_ERROR_CODES.INVITATION_NOT_FOUND,
		],
		[
			new EnrollmentForbiddenScopeError(),
			ENROLLMENT_ERROR_CODES.FORBIDDEN_SCOPE,
		],
		[
			new EnrollmentUnknownParticipantError(),
			ENROLLMENT_ERROR_CODES.UNKNOWN_PARTICIPANT,
		],
		[new EnrollmentUnknownGroupError(), ENROLLMENT_ERROR_CODES.UNKNOWN_GROUP],
		[
			new EnrollmentInvitationsDisabledError(),
			ENROLLMENT_ERROR_CODES.INVITATIONS_DISABLED,
		],
		[
			new EnrollmentInvitationRequiredError(),
			ENROLLMENT_ERROR_CODES.INVITATION_REQUIRED,
		],
		[new EnrollmentStateChangedError(), ENROLLMENT_ERROR_CODES.STATE_CHANGED],
	])("$constructor.name expone su código", (error, code) => {
		expect(error.code).toBe(code);
		expect(isDomainError(error)).toBe(true);
		expect(error).toBeInstanceOf(EnrollmentError);
	});
});

describe("details serializables", () => {
	test("el cierre viaja como ISO", () => {
		const closesAt = new Date("2026-10-10T06:59:00.000Z");

		expect(new EnrollmentClosedError(closesAt).details).toEqual({
			closesAt: "2026-10-10T06:59:00.000Z",
		});
	});

	test("el cupo lleva los lugares restantes", () => {
		expect(new EnrollmentFullError(2).details).toEqual({ seatsLeft: 2 });
	});
});
