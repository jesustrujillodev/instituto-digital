export const CALENDAR_VIEWS = ["month", "list"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/**
 * Por qué una sesión aparece en el calendario de alguien. Una misma sesión
 * puede llevar varios: los roles se acumulan (§3) y §6.7 pide verlos juntos.
 */
export const CALENDAR_LENSES = [
	"enrolled",
	"invited",
	"teaching",
	"organizing",
	"staff",
	"global",
] as const;
export type CalendarLens = (typeof CALENDAR_LENSES)[number];

export const DAYS_PER_WEEK = 7;

/** Límites del mes que se acepta pedir; fuera de ellos `Date.UTC` deja de ser fiable. */
export const CALENDAR_YEAR_RANGE = { min: 2000, max: 2100 } as const;
