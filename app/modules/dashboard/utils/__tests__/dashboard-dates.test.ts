import { describe, expect, test } from "vitest";
import { agoPhrase, closingPhrase, daysBetween } from "../dashboard-dates";

const TODAY = "2026-10-14";

describe("daysBetween", () => {
	test("cuenta días naturales, también al cruzar de mes", () => {
		expect(daysBetween("2026-09-18", TODAY)).toBe(26);
		expect(daysBetween(TODAY, "2026-10-15")).toBe(1);
		expect(daysBetween(TODAY, TODAY)).toBe(0);
	});
});

describe("agoPhrase", () => {
	test("dice hoy, ayer o hace N días en la zona de Tijuana", () => {
		// 23:30 del 13 de octubre en Tijuana ya es 14 en UTC: sigue siendo «ayer».
		expect(agoPhrase(new Date("2026-10-14T06:30:00.000Z"), TODAY)).toBe("ayer");
		expect(agoPhrase(new Date("2026-10-14T18:00:00.000Z"), TODAY)).toBe("hoy");
		expect(agoPhrase(new Date("2026-09-18T20:00:00.000Z"), TODAY)).toBe(
			"hace 26 días",
		);
	});
});

describe("closingPhrase", () => {
	test("nombra hoy y mañana, y si no da la fecha en dd-mm-aaaa", () => {
		expect(closingPhrase(new Date("2026-10-15T06:59:00.000Z"), TODAY)).toBe(
			"Cierra hoy, 14-10-2026",
		);
		expect(closingPhrase(new Date("2026-10-15T20:00:00.000Z"), TODAY)).toBe(
			"Cierra mañana, 15-10-2026",
		);
		expect(closingPhrase(new Date("2026-10-28T20:00:00.000Z"), TODAY)).toBe(
			"Cierra el 28-10-2026",
		);
	});
});
