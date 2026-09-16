import type { CalendarLens } from "../domain/calendar.config";

export const LENS_LABELS: Record<CalendarLens, string> = {
	enrolled: "Cursas",
	invited: "Invitación pendiente",
	teaching: "Impartes",
	organizing: "Organizas",
	staff: "Participa tu personal",
	global: "Institucional",
};

export const WEEKDAY_LABELS = [
	"Lun",
	"Mar",
	"Mié",
	"Jue",
	"Vie",
	"Sáb",
	"Dom",
] as const;

/** Qué lente decide el color cuando una sesión lleva varios. */
export const LENS_PRIORITY: readonly CalendarLens[] = [
	"organizing",
	"global",
	"teaching",
	"enrolled",
	"invited",
	"staff",
];

export const primaryLensOf = (lenses: readonly CalendarLens[]): CalendarLens =>
	LENS_PRIORITY.find((lens) => lenses.includes(lens)) ?? "global";

const monthFormatter = new Intl.DateTimeFormat("es-MX", {
	timeZone: "UTC",
	month: "long",
	year: "numeric",
});

const dayFormatter = new Intl.DateTimeFormat("es-MX", {
	timeZone: "UTC",
	weekday: "long",
	day: "numeric",
	month: "long",
});

const capitalize = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1);

// Un día o un mes del calendario no es un instante: se formatea en UTC para que
// ninguna zona lo corra al día anterior.
const calendarDate = (value: string) => {
	const [year, month, day = 1] = value.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
};

/** "Octubre de 2026" */
export const formatMonthLabel = (month: string): string =>
	capitalize(monthFormatter.format(calendarDate(month)));

/** "Martes, 20 de octubre" */
export const formatDayLabel = (day: string): string =>
	capitalize(dayFormatter.format(calendarDate(day)));
