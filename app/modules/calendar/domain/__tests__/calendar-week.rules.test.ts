import { describe, expect, test } from "vitest";
import { upcomingWeekOf } from "../calendar-week.rules";

describe("upcomingWeekOf", () => {
	test("siete días desde hoy en Tijuana, aunque en UTC ya sea mañana", () => {
		// 23:30 del 30 de septiembre en Tijuana (UTC−7).
		const week = upcomingWeekOf(new Date("2026-10-01T06:30:00.000Z"));

		expect(week.today).toBe("2026-09-30");
		expect(week.days).toEqual([
			"2026-09-30",
			"2026-10-01",
			"2026-10-02",
			"2026-10-03",
			"2026-10-04",
			"2026-10-05",
			"2026-10-06",
		]);
		expect(week.from.toISOString()).toBe("2026-09-30T07:00:00.000Z");
		expect(week.to.toISOString()).toBe("2026-10-07T07:00:00.000Z");
	});

	test("cruza el cambio de año", () => {
		const week = upcomingWeekOf(new Date("2027-01-01T07:30:00.000Z"));

		expect(week.days[0]).toBe("2026-12-31");
		expect(week.days[6]).toBe("2027-01-06");
	});

	test("el fin de horario de verano deja el límite en la medianoche de invierno", () => {
		const week = upcomingWeekOf(new Date("2026-10-28T19:00:00.000Z"));

		expect(week.days[6]).toBe("2026-11-03");
		expect(week.from.toISOString()).toBe("2026-10-28T07:00:00.000Z");
		expect(week.to.toISOString()).toBe("2026-11-04T08:00:00.000Z");
	});

	test("el inicio de horario de verano deja el límite en la medianoche de verano", () => {
		const week = upcomingWeekOf(new Date("2026-03-05T20:00:00.000Z"));

		expect(week.from.toISOString()).toBe("2026-03-05T08:00:00.000Z");
		expect(week.to.toISOString()).toBe("2026-03-12T07:00:00.000Z");
	});
});
