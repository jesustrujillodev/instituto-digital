import { describe, expect, test } from "vitest";
import {
	validateAssignParticipants,
	validateFindEnrollmentCourse,
	validateInviteParticipants,
	validateListAvailableCourses,
	validateSearchParticipants,
} from "../enrollment.validators";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";

describe("validateFindEnrollmentCourse", () => {
	test("exige un uuid", () => {
		expect(() => validateFindEnrollmentCourse({ documentId: "1" })).toThrow();
		expect(validateFindEnrollmentCourse({ documentId: USER_ID })).toEqual({
			documentId: USER_ID,
		});
	});
});

describe("validateListAvailableCourses", () => {
	test("acepta modalidad conocida y rechaza otra", () => {
		expect(validateListAvailableCourses({ modality: "ONLINE" })).toMatchObject({
			modality: "ONLINE",
		});
		expect(() => validateListAvailableCourses({ modality: "VR" })).toThrow();
	});
});

describe("validateSearchParticipants", () => {
	test("recorta el término", () => {
		expect(validateSearchParticipants({ search: "  ana " })).toEqual({
			search: "ana",
		});
	});
});

describe("validateAssignParticipants", () => {
	test("exige al menos una persona o un grupo", () => {
		expect(() => validateAssignParticipants({ userDocumentIds: [] })).toThrow();
		expect(validateAssignParticipants({ userDocumentIds: [USER_ID] })).toEqual({
			userDocumentIds: [USER_ID],
			groupDocumentIds: [],
		});
	});

	test("inscribe un grupo completo sin personas sueltas", () => {
		expect(
			validateAssignParticipants({ groupDocumentIds: [GROUP_ID] }),
		).toEqual({ userDocumentIds: [], groupDocumentIds: [GROUP_ID] });
	});
});

describe("validateInviteParticipants", () => {
	test("acepta solo grupos y completa las personas vacías", () => {
		expect(
			validateInviteParticipants({ groupDocumentIds: [GROUP_ID] }),
		).toEqual({ userDocumentIds: [], groupDocumentIds: [GROUP_ID] });
	});

	test("rechaza un envío sin personas ni grupos", () => {
		expect(() => validateInviteParticipants({})).toThrow();
	});

	test("rechaza ids que no son uuid", () => {
		expect(() =>
			validateInviteParticipants({ userDocumentIds: ["nope"] }),
		).toThrow();
	});
});
