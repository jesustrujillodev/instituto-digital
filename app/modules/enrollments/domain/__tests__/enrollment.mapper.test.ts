import { describe, expect, test } from "vitest";
import {
	type EnrollmentCourseRaw,
	toAvailableCourse,
	toEnrollmentCourse,
	toRosterEntry,
	withAvailability,
} from "../enrollment.mapper";

const rawOf = (
	overrides: Partial<EnrollmentCourseRaw> = {},
): EnrollmentCourseRaw => ({
	id: 7,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	title: "Protección civil básica",
	description: null,
	modality: "IN_PERSON",
	access: "INVITATION",
	status: "PUBLISHED",
	capacity: 2,
	enrollmentDeadline: null,
	dependency: { name: "SEDESOL" },
	_count: { enrollments: 1 },
	sessions: [
		{
			documentId: "s1",
			startsAt: new Date("2026-10-22T16:00:00Z"),
			endsAt: new Date("2026-10-22T18:00:00Z"),
			venue: "Sala B",
			link: null,
		},
		{
			documentId: "s2",
			startsAt: new Date("2026-10-23T16:00:00Z"),
			endsAt: new Date("2026-10-23T18:00:00Z"),
			venue: "Sala B",
			link: null,
		},
	],
	trainers: [
		{ user: { firstName: "Diana", lastName: null, email: "diana@x.mx" } },
	],
	...overrides,
});

describe("toEnrollmentCourse", () => {
	test("aplana dependencia, conteo y rango de sesiones", () => {
		const course = toEnrollmentCourse(rawOf());

		expect(course).toMatchObject({
			dependencyName: "SEDESOL",
			enrolledCount: 1,
			firstSessionAt: new Date("2026-10-22T16:00:00Z"),
			lastSessionEndsAt: new Date("2026-10-23T18:00:00Z"),
			trainers: [{ firstName: "Diana", lastName: null, email: "diana@x.mx" }],
		});
	});

	test("sin sesiones deja el rango en null", () => {
		expect(toEnrollmentCourse(rawOf({ sessions: [] }))).toMatchObject({
			firstSessionAt: null,
			lastSessionEndsAt: null,
		});
	});
});

describe("disponibilidad", () => {
	test("withAvailability calcula lugares, cierre y apertura", () => {
		const course = toEnrollmentCourse(rawOf());

		expect(withAvailability(course, new Date("2026-10-01"))).toMatchObject({
			seatsLeft: 1,
			closesAt: new Date("2026-10-22T16:00:00Z"),
			isOpen: true,
		});
	});

	test("toAvailableCourse conserva el estado propio", () => {
		const available = toAvailableCourse(toEnrollmentCourse(rawOf()), "INVITED");

		expect(available).toMatchObject({
			sessionCount: 2,
			seatsLeft: 1,
			myStatus: "INVITED",
		});
	});
});

describe("toRosterEntry", () => {
	test("usa la dependencia con la que se inscribió", () => {
		const entry = toRosterEntry({
			documentId: "e1",
			origin: "ASSIGNED",
			status: "ENROLLED",
			result: "PENDING",
			updatedAt: new Date(0),
			dependency: { name: "SOP" },
			user: {
				documentId: "u1",
				firstName: "Carlos",
				lastName: null,
				email: "carlos@x.mx",
			},
		});

		expect(entry).toMatchObject({
			userDocumentId: "u1",
			dependencyName: "SOP",
			origin: "ASSIGNED",
		});
	});
});
