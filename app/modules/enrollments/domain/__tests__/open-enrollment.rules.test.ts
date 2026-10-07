import { describe, expect, test } from "vitest";
import type { OpenEnrollmentRecord } from "../enrollment-summary.types";
import {
	lowEnrollmentOf,
	toOpenEnrollmentSummary,
} from "../open-enrollment.rules";

const NOW = new Date("2026-09-16T18:00:00.000Z");
const IN_THREE_DAYS = new Date("2026-09-19T18:00:00.000Z");
const IN_A_MONTH = new Date("2026-10-16T18:00:00.000Z");

const recordOf = (
	overrides: Partial<OpenEnrollmentRecord & { invited: number }> = {},
): OpenEnrollmentRecord & { invited: number } => ({
	id: 1,
	documentId: "c-1",
	title: "Excel básico",
	format: "SCHEDULED",
	capacity: 20,
	enrollmentDeadline: null,
	firstSessionAt: IN_A_MONTH,
	enrolled: 0,
	invited: 0,
	...overrides,
});

describe("lowEnrollmentOf", () => {
	test("empieza pronto y no llega a la mitad del cupo", () => {
		expect(
			lowEnrollmentOf(
				{ capacity: 20, enrolled: 9, firstSessionAt: IN_THREE_DAYS },
				NOW,
			),
		).toBe(true);
		expect(
			lowEnrollmentOf(
				{ capacity: 20, enrolled: 10, firstSessionAt: IN_THREE_DAYS },
				NOW,
			),
		).toBe(false);
	});

	test("lo que empieza lejos no se señala", () => {
		expect(
			lowEnrollmentOf(
				{ capacity: 20, enrolled: 0, firstSessionAt: IN_A_MONTH },
				NOW,
			),
		).toBe(false);
	});

	test("sin cupo, solo se señala si nadie se ha inscrito", () => {
		expect(
			lowEnrollmentOf(
				{ capacity: null, enrolled: 0, firstSessionAt: IN_THREE_DAYS },
				NOW,
			),
		).toBe(true);
		expect(
			lowEnrollmentOf(
				{ capacity: null, enrolled: 1, firstSessionAt: IN_THREE_DAYS },
				NOW,
			),
		).toBe(false);
	});

	test("un autogestivo sin sesiones no arranca, así que no se señala", () => {
		expect(
			lowEnrollmentOf({ capacity: 20, enrolled: 0, firstSessionAt: null }, NOW),
		).toBe(false);
	});
});

describe("toOpenEnrollmentSummary", () => {
	test("ordena por cierre, con lo que no cierra al final, y recorta", () => {
		const summary = toOpenEnrollmentSummary(
			[
				recordOf({
					documentId: "sin-cierre",
					format: "SELF_PACED",
					firstSessionAt: null,
				}),
				recordOf({ documentId: "lejano" }),
				recordOf({
					documentId: "pronto",
					enrollmentDeadline: new Date("2026-09-18T07:00:00.000Z"),
				}),
			],
			NOW,
			2,
		);

		expect(summary.courses.map((course) => course.documentId)).toEqual([
			"pronto",
			"lejano",
		]);
		expect(summary.total).toBe(3);
	});

	test("cada renglón dice cuándo cierra y si urge", () => {
		const [row] = toOpenEnrollmentSummary(
			[recordOf({ firstSessionAt: IN_THREE_DAYS, enrolled: 2, invited: 3 })],
			NOW,
			5,
		).courses;

		expect(row).toMatchObject({
			closesAt: IN_THREE_DAYS,
			closesSoon: true,
			startsInDays: 3,
			lowEnrollment: true,
			enrolled: 2,
			invited: 3,
		});
	});
});
