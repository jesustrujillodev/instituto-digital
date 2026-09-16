import { utcToZonedInput, zonedInputToUtc } from "@/lib/date-utils";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	resolveCourseScope,
	VIEWABLE_STATUSES,
} from "@/modules/courses/domain/course.access";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import { canParticipate } from "@/modules/enrollments/domain/enrollment.rules";
import {
	CALENDAR_YEAR_RANGE,
	type CalendarLens,
	DAYS_PER_WEEK,
} from "./calendar.config";
import { CalendarInvalidMonthError } from "./calendar.errors";
import type {
	CalendarFilters,
	CalendarOption,
	CalendarPeriod,
	CalendarPlan,
	CalendarSession,
	CalendarSessionRow,
	CalendarTrainerRow,
} from "./calendar.types";

type CalendarActor = Pick<
	AuthContext,
	"userId" | "role" | "dependencyId" | "isTrainer"
>;

// ── Quién ve qué ──────────────────────────────────────────────────────────────

export const resolveCalendarPlan = (
	actor: CalendarActor,
	wantsStaff: boolean,
): CalendarPlan => {
	const organizer = resolveCourseScope(actor);

	return {
		viewerId: actor.userId,
		participates: canParticipate(actor),
		organizer,
		staffDependencyId:
			wantsStaff && organizer.kind === "dependency"
				? organizer.dependencyId
				: null,
	};
};

/** Solo el titular y el auxiliar consultan a su personal (§6.7). */
export const canToggleStaff = (plan: CalendarPlan): boolean =>
	plan.organizer.kind === "dependency";

const isViewable = (status: CourseStatus) => VIEWABLE_STATUSES.includes(status);

const organizes = (plan: CalendarPlan, row: CalendarSessionRow): boolean => {
	const { organizer } = plan;

	switch (organizer.kind) {
		case "global":
			return false;
		case "dependency":
			return row.course.dependencyId === organizer.dependencyId;
		case "creator":
			return (
				row.course.dependencyId === organizer.dependencyId &&
				row.course.createdById === organizer.userId
			);
		case "none":
			return false;
		default: {
			const exhaustive: never = organizer;
			return exhaustive;
		}
	}
};

/**
 * Los motivos por los que la sesión le corresponde a quien consulta.
 *
 * Replica en memoria el `where` de `calendarCourseWhere`: la consulta decide qué
 * filas llegan, y esto las etiqueta. Un borrador solo puede entrar por
 * `organizing` o `global`, y una invitación solo mientras el curso siga publicado.
 */
export const lensesOf = (
	plan: CalendarPlan,
	row: CalendarSessionRow,
): CalendarLens[] => {
	const { status } = row.course;
	if (status === "CANCELLED") return [];

	const lenses: CalendarLens[] = [];

	if (
		plan.participates &&
		isViewable(status) &&
		row.viewerStatus === "ENROLLED"
	) {
		lenses.push("enrolled");
	}
	if (
		plan.participates &&
		status === "PUBLISHED" &&
		row.viewerStatus === "INVITED"
	) {
		lenses.push("invited");
	}
	if (
		isViewable(status) &&
		row.trainers.some((trainer) => trainer.userId === plan.viewerId)
	) {
		lenses.push("teaching");
	}
	if (organizes(plan, row)) lenses.push("organizing");
	if (
		plan.staffDependencyId !== null &&
		isViewable(status) &&
		row.staffEnrolled
	) {
		lenses.push("staff");
	}
	if (plan.organizer.kind === "global") lenses.push("global");

	return lenses;
};

/**
 * A qué detalle lleva "Ver curso".
 *
 * Quien organiza va a la edición. Quien cursa, o imparte siendo alguien que
 * puede cursar, va al detalle de participante, que ya lo deja ver su curso. El
 * capacitador externo y el titular que solo mira a su personal no tienen un
 * detalle que les responda: les basta el panel.
 */
export const resolveCourseHref = (
	lenses: readonly CalendarLens[],
	courseDocumentId: string,
	plan: CalendarPlan,
): string | null => {
	if (lenses.includes("organizing") || lenses.includes("global")) {
		return `/dashboard/cursos/${courseDocumentId}/editar`;
	}
	if (
		lenses.includes("enrolled") ||
		lenses.includes("invited") ||
		(lenses.includes("teaching") && plan.participates)
	) {
		return `/dashboard/cursos-disponibles/${courseDocumentId}`;
	}
	return null;
};

const trainerName = (trainer: CalendarTrainerRow) =>
	[trainer.firstName, trainer.lastName].filter(Boolean).join(" ") ||
	trainer.email;

/** Etiqueta cada fila y descarta la que no tenga motivo para mostrarse. */
export const toCalendarSessions = (
	plan: CalendarPlan,
	rows: readonly CalendarSessionRow[],
): CalendarSession[] =>
	rows.flatMap((row) => {
		const lenses = lensesOf(plan, row);
		if (lenses.length === 0) return [];

		return [
			{
				documentId: row.documentId,
				startsAt: row.startsAt,
				endsAt: row.endsAt,
				venue: row.venue,
				link: row.link,
				course: {
					documentId: row.course.documentId,
					title: row.course.title,
					modality: row.course.modality,
					status: row.course.status,
					dependency: {
						documentId: row.course.dependency.documentId,
						name: row.course.dependency.name,
					},
				},
				trainers: row.trainers.map((trainer) => ({
					documentId: trainer.documentId,
					name: trainerName(trainer),
				})),
				lenses,
				courseHref: resolveCourseHref(lenses, row.course.documentId, plan),
			},
		];
	});

// ── Filtros ───────────────────────────────────────────────────────────────────

const uniqueSorted = (options: CalendarOption[]): CalendarOption[] =>
	[
		...new Map(options.map((option) => [option.documentId, option])).values(),
	].sort((a, b) => a.name.localeCompare(b.name, "es"));

/**
 * Opciones de filtro sacadas de lo que ya es visible, no de catálogos: un
 * participante no consulta el catálogo de capacitadores (§3).
 */
export const filterOptionsOf = (sessions: readonly CalendarSession[]) => ({
	dependencies: uniqueSorted(
		sessions.map((session) => session.course.dependency),
	),
	trainers: uniqueSorted(sessions.flatMap((session) => session.trainers)),
});

export const applyCalendarFilters = (
	sessions: readonly CalendarSession[],
	filters: CalendarFilters,
): CalendarSession[] =>
	sessions.filter(
		(session) =>
			(!filters.dependency ||
				session.course.dependency.documentId === filters.dependency) &&
			(!filters.modality || session.course.modality === filters.modality) &&
			(!filters.trainer ||
				session.trainers.some(
					(trainer) => trainer.documentId === filters.trainer,
				)),
	);

// ── Periodo ───────────────────────────────────────────────────────────────────

const pad = (value: number) => String(value).padStart(2, "0");

const formatMonth = (year: number, month: number) => `${year}-${pad(month)}`;

/** `YYYY-MM` a año y mes, dentro del rango aceptado. */
export const parseMonth = (value: string): { year: number; month: number } => {
	const [year, month] = value.split("-").map(Number);

	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		month < 1 ||
		month > 12 ||
		year < CALENDAR_YEAR_RANGE.min ||
		year > CALENDAR_YEAR_RANGE.max
	) {
		throw new CalendarInvalidMonthError(value);
	}

	return { year, month };
};

/** El mes en curso en la zona del instituto, no en la del servidor. */
export const currentMonth = (now: Date): string =>
	utcToZonedInput(now).date.slice(0, 7);

export const shiftMonth = (value: string, delta: number): string => {
	const { year, month } = parseMonth(value);
	const index = year * 12 + (month - 1) + delta;

	return formatMonth(Math.floor(index / 12), (index % 12) + 1);
};

/**
 * Días de la cuadrícula mensual: semanas completas de lunes a domingo.
 *
 * Es aritmética de calendario, sin zona horaria: un día `YYYY-MM-DD` es el mismo
 * en cualquier zona. La zona entra solo al convertir los extremos en instantes.
 */
export const monthGridDays = (value: string): string[] => {
	const { year, month } = parseMonth(value);
	const first = Date.UTC(year, month - 1, 1);
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

	const leading = (new Date(first).getUTCDay() + 6) % DAYS_PER_WEEK;
	const total =
		Math.ceil((leading + daysInMonth) / DAYS_PER_WEEK) * DAYS_PER_WEEK;
	const dayMs = 24 * 60 * 60 * 1000;

	return Array.from({ length: total }, (_, index) => {
		const day = new Date(first + (index - leading) * dayMs);
		return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
	});
};

const nextDay = (day: string): string => {
	const [year, month, date] = day.split("-").map(Number);
	const next = new Date(Date.UTC(year, month - 1, date + 1));

	return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

export const toCalendarPeriod = (month: string): CalendarPeriod => ({
	month,
	previousMonth: shiftMonth(month, -1),
	nextMonth: shiftMonth(month, 1),
	days: monthGridDays(month),
});

/**
 * Instantes UTC que cubre la cuadrícula: desde la medianoche de Tijuana del
 * primer día hasta la del día siguiente al último, sin incluirla.
 */
export const periodRange = (
	period: CalendarPeriod,
): { from: Date; to: Date } => ({
	from: zonedInputToUtc(period.days[0], "00:00"),
	to: zonedInputToUtc(nextDay(period.days[period.days.length - 1]), "00:00"),
});

/** El día `YYYY-MM-DD` en que cae un instante, en la zona del instituto. */
export const zonedDayOf = (value: Date): string => utcToZonedInput(value).date;
