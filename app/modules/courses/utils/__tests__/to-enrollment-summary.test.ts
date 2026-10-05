import { describe, expect, test } from "vitest";
import type { CourseRosterSummary } from "@/modules/enrollments/domain/enrollment.types";
import { toEnrollmentSummary } from "../to-enrollment-summary";

describe("toEnrollmentSummary", () => {
	test("toma los inscritos y las invitaciones pendientes de los conteos", () => {
		const summary = toEnrollmentSummary({
			course: {
				enrolledCount: 2,
				capacity: 10,
				seatsLeft: 8,
				closesAt: null,
				isOpen: true,
			},
			invited: 1,
		} as unknown as CourseRosterSummary);

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
