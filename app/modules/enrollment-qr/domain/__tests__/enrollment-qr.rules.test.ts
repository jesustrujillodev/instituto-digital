import { describe, expect, test } from "vitest";
import type {
	CourseAccessType,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import { ENROLLMENT_QR_ERROR_CODES } from "../enrollment-qr.errors";
import {
	acceptsEnrollmentQr,
	assertAcceptsEnrollmentQr,
} from "../enrollment-qr.rules";
import { validateEnrollmentQrToken } from "../enrollment-qr.validators";

describe("acceptsEnrollmentQr", () => {
	test.each<[CourseStatus, CourseAccessType, boolean]>([
		["PUBLISHED", "PUBLIC", true],
		["PUBLISHED", "RESTRICTED", true],
		["PUBLISHED", "INVITATION", false],
		["DRAFT", "PUBLIC", false],
		["FINISHED", "PUBLIC", false],
		["CANCELLED", "RESTRICTED", false],
	])("%s + %s → %s", (status, access, expected) => {
		expect(acceptsEnrollmentQr({ status, access })).toBe(expected);
	});

	test("la aserción lanza el error estable del curso no apto", () => {
		expect(() =>
			assertAcceptsEnrollmentQr({ status: "PUBLISHED", access: "INVITATION" }),
		).toThrow(
			expect.objectContaining({ code: ENROLLMENT_QR_ERROR_CODES.UNAVAILABLE }),
		);
	});
});

describe("validateEnrollmentQrToken", () => {
	test("acepta 32 caracteres base64url", () => {
		expect(validateEnrollmentQrToken("aB3-_aB3-_aB3-_aB3-_aB3-_aB3-_aB")).toBe(
			"aB3-_aB3-_aB3-_aB3-_aB3-_aB3-_aB",
		);
	});

	test.each([
		"corto",
		"A".repeat(33),
		"AAAA/AAAAAAAAAAAAAAAAAAAAAAAAAAA",
		"AAAA AAAAAAAAAAAAAAAAAAAAAAAAAAA",
	])("rechaza %s", (token) => {
		expect(() => validateEnrollmentQrToken(token)).toThrow();
	});
});
