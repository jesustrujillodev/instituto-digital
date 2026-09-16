import { DomainError } from "@/shared/errors/domain-error";

export const CALENDAR_ERROR_CODES = {
	INVALID_MONTH: "CALENDAR_INVALID_MONTH",
} as const;

export abstract class CalendarError extends DomainError {}

export class CalendarInvalidMonthError extends CalendarError {
	readonly code = CALENDAR_ERROR_CODES.INVALID_MONTH;
	readonly details: { month: string };
	constructor(month: string) {
		super("Invalid calendar month");
		this.details = { month };
	}
}
