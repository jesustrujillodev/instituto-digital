import { describe, expect, test } from "vitest";
import { validateCalendarQuery } from "../calendar.validators";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

describe("validateCalendarQuery", () => {
	test("sin parámetros: vista de mes y sin personal", () => {
		expect(validateCalendarQuery({})).toEqual({ view: "month", staff: false });
	});

	test("acepta todos los filtros", () => {
		expect(
			validateCalendarQuery({
				month: "2026-10",
				view: "list",
				dependency: DOCUMENT_ID,
				modality: "HYBRID",
				trainer: DOCUMENT_ID,
				staff: true,
			}),
		).toMatchObject({ month: "2026-10", view: "list", staff: true });
	});

	test.each([
		[{ month: "octubre" }],
		[{ month: "2026-1" }],
		[{ view: "semana" }],
		[{ modality: "REMOTE" }],
		[{ dependency: "sop" }],
		[{ trainer: "42" }],
	])("rechaza %j", (input) => {
		expect(() => validateCalendarQuery(input)).toThrow();
	});
});
