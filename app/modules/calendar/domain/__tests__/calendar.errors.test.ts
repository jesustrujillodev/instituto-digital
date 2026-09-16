import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	CALENDAR_ERROR_CODES,
	CalendarError,
	CalendarInvalidMonthError,
} from "../calendar.errors";

describe("CalendarInvalidMonthError", () => {
	test("expone su código y el mes pedido", () => {
		const error = new CalendarInvalidMonthError("2026-13");

		expect(error.code).toBe(CALENDAR_ERROR_CODES.INVALID_MONTH);
		expect(error.details).toEqual({ month: "2026-13" });
		expect(isDomainError(error)).toBe(true);
		expect(error).toBeInstanceOf(CalendarError);
	});
});
