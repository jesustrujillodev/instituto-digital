import { formatZonedDate, utcToZonedInput } from "@/lib/date-utils";

const DAY_MS = 86_400_000;

const utcOf = (day: string) => {
	const [year, month, date] = day.split("-").map(Number);
	return Date.UTC(year, month - 1, date);
};

/** Días naturales de `from` a `to`, ambos `YYYY-MM-DD` en la zona del instituto. */
export const daysBetween = (from: string, to: string): number =>
	Math.round((utcOf(to) - utcOf(from)) / DAY_MS);

/** «hoy», «ayer» o «hace 26 días», contado en días de Tijuana. */
export const agoPhrase = (value: Date, today: string): string => {
	const days = daysBetween(utcToZonedInput(value).date, today);
	if (days <= 0) return "hoy";
	if (days === 1) return "ayer";
	return `hace ${days} días`;
};

/** «Cierra hoy, 14-10-2026», «Cierra mañana, 15-10-2026» o «Cierra el 28-10-2026». */
export const closingPhrase = (closesAt: Date, today: string): string => {
	const days = daysBetween(today, utcToZonedInput(closesAt).date);
	const date = formatZonedDate(closesAt);
	if (days <= 0) return `Cierra hoy, ${date}`;
	if (days === 1) return `Cierra mañana, ${date}`;
	return `Cierra el ${date}`;
};
