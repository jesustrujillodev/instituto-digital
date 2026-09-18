import { describe, expect, test } from "vitest";
import type { CourseRoster } from "@/modules/enrollments/domain/enrollment.types";
import { toEnrollmentSummary } from "../to-enrollment-summary";

const rosterOf = (statuses: string[]): CourseRoster =>
	({
		course: {
			enrolledCount: 2,
			capacity: 10,
			seatsLeft: 8,
			closesAt: null,
			isOpen: true,
		},
		entries: statuses.map((status) => ({ status })),
	}) as unknown as CourseRoster;

describe("toEnrollmentSummary", () => {
	test("toma los inscritos del conteo y cuenta solo las invitaciones pendientes", () => {
		const summary = toEnrollmentSummary(
			rosterOf(["ENROLLED", "ENROLLED", "INVITED", "DECLINED", "WITHDRAWN"]),
		);

		expect(summary).toEqual({
			enrolled: 2,
			invited: 1,
			capacity: 10,
			seatsLeft: 8,
			closesAt: null,
			isOpen: true,
		});
	});
});
