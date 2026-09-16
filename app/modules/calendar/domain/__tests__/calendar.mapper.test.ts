import { describe, expect, test } from "vitest";
import {
	type StoredCalendarSession,
	toCalendarSessionRow,
} from "../calendar.mapper";

const storedOf = (
	course: Partial<StoredCalendarSession["course"]> = {},
): StoredCalendarSession => ({
	documentId: "s1",
	startsAt: new Date("2026-10-20T23:00:00.000Z"),
	endsAt: new Date("2026-10-21T02:00:00.000Z"),
	venue: "Sala B",
	link: null,
	course: {
		documentId: "c1",
		title: "Atención ciudadana",
		modality: "IN_PERSON",
		status: "PUBLISHED",
		dependencyId: 4,
		createdById: 9,
		dependency: { documentId: "d1", name: "SEDESOL" },
		trainers: [
			{
				userId: 8,
				user: {
					documentId: "t8",
					firstName: "Diana",
					lastName: null,
					email: "diana.sds@instituto.gob.mx",
				},
			},
		],
		enrollments: [],
		_count: { enrollments: 0 },
		...course,
	},
});

describe("toCalendarSessionRow", () => {
	test("aplana capacitadores y resume inscripciones", () => {
		const row = toCalendarSessionRow(
			storedOf({
				enrollments: [{ status: "INVITED" }],
				_count: { enrollments: 2 },
			}),
		);

		expect(row.trainers).toEqual([
			{
				userId: 8,
				documentId: "t8",
				firstName: "Diana",
				lastName: null,
				email: "diana.sds@instituto.gob.mx",
			},
		]);
		expect(row.viewerStatus).toBe("INVITED");
		expect(row.staffEnrolled).toBe(true);
		expect(row.course).not.toHaveProperty("trainers");
	});

	test("sin fila propia ni personal inscrito", () => {
		const row = toCalendarSessionRow(storedOf());

		expect(row.viewerStatus).toBeNull();
		expect(row.staffEnrolled).toBe(false);
	});
});
