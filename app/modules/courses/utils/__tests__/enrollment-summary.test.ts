import { describe, expect, test } from "vitest";
import {
	type EnrollmentSummaryInput,
	enrollmentSummaryOf,
	firstSessionStartOf,
} from "../enrollment-summary";

const inputOf = (
	overrides: Partial<EnrollmentSummaryInput> = {},
): EnrollmentSummaryInput => ({
	access: "PUBLIC",
	dependencyCount: 0,
	groupCount: 0,
	capacity: "",
	deadline: "",
	firstSessionStart: null,
	scheduled: true,
	...overrides,
});

describe("firstSessionStartOf", () => {
	test("toma la más temprana y descarta las incompletas", () => {
		const start = firstSessionStartOf([
			{ date: "2026-09-25", startTime: "09:00" },
			{ date: "2026-09-23", startTime: "10:00" },
			{ date: "2026-09-20", startTime: "" },
		]);

		// 10:00 en Tijuana (UTC-7 en septiembre).
		expect(start?.toISOString()).toBe("2026-09-23T17:00:00.000Z");
	});

	test("sin sesiones completas no hay inicio", () => {
		expect(firstSessionStartOf([{ date: "", startTime: "" }])).toBeNull();
	});
});

describe("enrollmentSummaryOf", () => {
	test("público, sin límite, hasta la primera sesión", () => {
		expect(
			enrollmentSummaryOf(
				inputOf({ firstSessionStart: new Date("2026-09-23T17:00:00.000Z") }),
			),
		).toBe(
			"Todo el personal interno podrá verlo e inscribirse, sin límite de lugares, hasta el 23 sep 2026 a las 10:00.",
		);
	});

	test("restringido cuenta lo elegido y el cupo", () => {
		expect(
			enrollmentSummaryOf(
				inputOf({
					access: "RESTRICTED",
					dependencyCount: 2,
					groupCount: 1,
					capacity: "30",
				}),
			),
		).toBe(
			"El personal de 2 dependencias y 1 grupo podrá verlo e inscribirse, con 30 lugares, hasta que empiece la primera sesión.",
		);
	});

	test("restringido sin audiencia avisa que nadie lo verá", () => {
		expect(enrollmentSummaryOf(inputOf({ access: "RESTRICTED" }))).toMatch(
			/^Nadie podrá verlo todavía/,
		);
	});

	test("una fecha límite manda sobre la primera sesión", () => {
		expect(
			enrollmentSummaryOf(
				inputOf({
					access: "INVITATION",
					deadline: "2026-09-20",
					firstSessionStart: new Date("2026-09-23T17:00:00.000Z"),
				}),
			),
		).toBe(
			"Solo quien invites podrá verlo e inscribirse, sin límite de lugares, hasta el 20 sep 2026.",
		);
	});

	test("un autogestivo sin fecha no cierra solo", () => {
		expect(enrollmentSummaryOf(inputOf({ scheduled: false }))).toBe(
			"Todo el personal interno podrá verlo e inscribirse, sin límite de lugares, mientras no se cierren las inscripciones.",
		);
	});
});
