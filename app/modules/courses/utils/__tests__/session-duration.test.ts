import { describe, expect, test } from "vitest";
import { formatDuration, sessionMinutes } from "../session-duration";

describe("sessionMinutes", () => {
	test("cuenta los minutos entre inicio y fin", () => {
		expect(sessionMinutes("10:00", "12:30")).toBe(150);
	});

	test.each([
		["", "12:00"],
		["10:00", ""],
		["10:00", "10:00"],
		["12:00", "10:00"],
	])("sin horario válido no hay duración (%s–%s)", (start, end) => {
		expect(sessionMinutes(start, end)).toBeNull();
	});
});

describe("formatDuration", () => {
	test.each([
		[45, "45 min"],
		[120, "2 h"],
		[90, "1 h 30 min"],
	])("%i minutos se leen %s", (minutes, label) => {
		expect(formatDuration(minutes)).toBe(label);
	});
});
