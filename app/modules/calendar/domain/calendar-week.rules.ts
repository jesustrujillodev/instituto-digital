import { zonedInputToUtc } from "@/lib/date-utils";
import { DAYS_PER_WEEK } from "./calendar.config";
import { nextDay, zonedDayOf } from "./calendar.rules";

export interface UpcomingWeek {
	today: string;
	/** Los siete días `YYYY-MM-DD` desde hoy, en la zona del instituto. */
	days: string[];
	from: Date;
	to: Date;
}

/**
 * Hoy y los seis días siguientes. No es la semana de lunes a domingo del
 * calendario: el panel mira hacia adelante, y un domingo mostraría un solo día.
 */
export const upcomingWeekOf = (now: Date): UpcomingWeek => {
	const today = zonedDayOf(now);
	const days = [today];
	while (days.length < DAYS_PER_WEEK) days.push(nextDay(days[days.length - 1]));

	return {
		today,
		days,
		from: zonedInputToUtc(today, "00:00"),
		to: zonedInputToUtc(nextDay(days[days.length - 1]), "00:00"),
	};
};
