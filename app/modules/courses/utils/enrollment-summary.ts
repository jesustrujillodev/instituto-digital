import {
	DATE_INPUT_PATTERN,
	formatZonedDate,
	formatZonedTime,
	TIME_INPUT_PATTERN,
	zonedInputToUtc,
} from "@/lib/date-utils";
import type { CourseAccessType } from "../domain/course.rules";

/** La primera sesión con fecha y hora completas, ya como instante. */
export const firstSessionStartOf = (
	sessions: readonly { date: string; startTime: string }[],
): Date | null => {
	const starts = sessions
		.filter(
			(session) =>
				DATE_INPUT_PATTERN.test(session.date) &&
				TIME_INPUT_PATTERN.test(session.startTime),
		)
		.map((session) => zonedInputToUtc(session.date, session.startTime))
		.sort((a, b) => a.getTime() - b.getTime());

	return starts[0] ?? null;
};

/** "23 sep 2026 a las 10:00", en horario de Tijuana. */
export const formatStart = (start: Date) =>
	`${formatZonedDate(start)} a las ${formatZonedTime(start)}`;

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

export interface EnrollmentSummaryInput {
	access: CourseAccessType;
	dependencyCount: number;
	groupCount: number;
	/** Vacío es sin límite, como en el formulario. */
	capacity: string;
	/** `AAAA-MM-DD`; vacío es "hasta que empiece" o, sin sesiones, sin fecha. */
	deadline: string;
	firstSessionStart: Date | null;
	scheduled: boolean;
}

const whoOf = ({
	access,
	dependencyCount,
	groupCount,
}: EnrollmentSummaryInput) => {
	if (access === "PUBLIC")
		return "Todo el personal interno podrá verlo e inscribirse";
	if (access === "INVITATION")
		return "Solo quien invites podrá verlo e inscribirse";

	const chosen = [
		dependencyCount > 0 &&
			plural(dependencyCount, "dependencia", "dependencias"),
		groupCount > 0 && plural(groupCount, "grupo", "grupos"),
	].filter(Boolean);

	return chosen.length === 0
		? "Nadie podrá verlo todavía: elige al menos una dependencia o un grupo"
		: `El personal de ${chosen.join(" y ")} podrá verlo e inscribirse`;
};

const seatsOf = (capacity: string) => {
	const seats = Number(capacity);
	return capacity.trim() === "" || !Number.isInteger(seats) || seats < 1
		? "sin límite de lugares"
		: `con ${plural(seats, "lugar", "lugares")}`;
};

const untilOf = ({
	deadline,
	firstSessionStart,
	scheduled,
}: EnrollmentSummaryInput) => {
	if (DATE_INPUT_PATTERN.test(deadline)) {
		return `hasta el ${formatZonedDate(zonedInputToUtc(deadline, "12:00"))}`;
	}
	if (!scheduled) return "mientras no se cierren las inscripciones";
	return firstSessionStart
		? `hasta el ${formatStart(firstSessionStart)}`
		: "hasta que empiece la primera sesión";
};

/**
 * Lo que el paso decide, dicho en una frase: quién, cuántos y hasta cuándo.
 * Es lo que la persona debe poder confirmar antes de publicar.
 */
export const enrollmentSummaryOf = (input: EnrollmentSummaryInput): string =>
	`${whoOf(input)}, ${seatsOf(input.capacity)}, ${untilOf(input)}.`;
