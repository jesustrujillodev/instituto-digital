/**
 * Fechas y horas del instituto.
 *
 * La plataforma opera en una sola zona horaria. Todo instante se PERSISTE en
 * UTC y se captura y se muestra en la zona del instituto, y la conversión pasa
 * únicamente por este archivo. Sin ese punto único, un curso de noviembre
 * aparecería una hora corrido respecto a uno de julio y nadie sabría por qué.
 *
 * No hay librería de fechas: `Intl` ya conoce el horario de verano de Tijuana.
 * Codificar las reglas de cambio a mano sería justo el error que esto evita.
 */

/** Única constante de zona horaria del proyecto. */
export const INSTITUTE_TIME_ZONE = "America/Tijuana";

/** `YYYY-MM-DD`, lo que produce y consume `<input type="date">`. */
export const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `HH:mm` en reloj de 24 horas, lo que produce y consume `<input type="time">`. */
export const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: INSTITUTE_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	// h23 y no `hour12: false`: algunas versiones de ICU devuelven "24" para la
	// medianoche con la segunda forma.
	hourCycle: "h23",
});

type ZonedParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

const zonedPartsOf = (value: Date): ZonedParts => {
	const parts = partsFormatter.formatToParts(value);
	const read = (type: Intl.DateTimeFormatPartTypes): number =>
		Number(parts.find((part) => part.type === type)?.value ?? "0");

	return {
		year: read("year"),
		month: read("month"),
		day: read("day"),
		hour: read("hour"),
		minute: read("minute"),
		second: read("second"),
	};
};

/** Los componentes de reloj, leídos como si fueran UTC. */
const asPseudoUtc = (parts: ZonedParts): number =>
	Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second,
	);

/** Cuánto se adelanta la zona al UTC en ese instante concreto. */
const zoneOffsetMs = (value: Date): number =>
	asPseudoUtc(zonedPartsOf(value)) - value.getTime();

/**
 * Hora de pared del instituto al instante UTC que se guarda.
 *
 * Se resuelve en dos pasos porque el desfase depende del instante que estamos
 * calculando: se estima con el desfase aproximado y se corrige si el resultado
 * cae al otro lado de un cambio de horario. Sin la corrección, las horas del
 * día del cambio se guardan con una hora de error.
 */
export const zonedInputToUtc = (dateInput: string, timeInput: string): Date => {
	if (
		!DATE_INPUT_PATTERN.test(dateInput) ||
		!TIME_INPUT_PATTERN.test(timeInput)
	) {
		throw new RangeError(`Invalid zoned input: "${dateInput}" "${timeInput}"`);
	}

	const [year, month, day] = dateInput.split("-").map(Number);
	const [hour, minute] = timeInput.split(":").map(Number);

	const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);

	const estimated = wallClock - zoneOffsetMs(new Date(wallClock));
	const corrected = wallClock - zoneOffsetMs(new Date(estimated));

	return new Date(corrected);
};

/** El inverso: el instante guardado a los dos campos del formulario. */
export const utcToZonedInput = (
	value: Date,
): { date: string; time: string } => {
	const { year, month, day, hour, minute } = zonedPartsOf(value);
	const pad = (part: number) => String(part).padStart(2, "0");

	return {
		date: `${year}-${pad(month)}-${pad(day)}`,
		time: `${pad(hour)}:${pad(minute)}`,
	};
};

/**
 * El último minuto de ese día en la zona del instituto.
 *
 * La fecha límite de inscripción se captura como día, no como instante: quien
 * escribe "12 de octubre" quiere todo el 12 de octubre.
 */
export const endOfZonedDay = (dateInput: string): Date =>
	zonedInputToUtc(dateInput, "23:59");

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
	timeZone: INSTITUTE_TIME_ZONE,
	day: "numeric",
	month: "short",
	year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("es-MX", {
	timeZone: INSTITUTE_TIME_ZONE,
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

/** "5 oct 2026" */
export const formatZonedDate = (value: Date): string =>
	dateFormatter.format(value);

/** "09:00" */
export const formatZonedTime = (value: Date): string =>
	timeFormatter.format(value);

/** "5 oct 2026, 09:00–13:00" — el guion es una raya, no un menos. */
export const formatSessionRange = (startsAt: Date, endsAt: Date): string =>
	`${formatZonedDate(startsAt)}, ${formatZonedTime(startsAt)}–${formatZonedTime(endsAt)}`;
