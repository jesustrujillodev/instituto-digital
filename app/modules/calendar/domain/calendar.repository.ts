import type { CalendarCourseFilter } from "./calendar.access";
import type { CalendarSessionRow } from "./calendar.types";

export interface FindCalendarSessionsParams {
	from: Date;
	to: Date;
	/** Ya resuelto desde el plan del visor: el repositorio no decide alcance. */
	courseFilter: CalendarCourseFilter;
	viewerId: number;
	staffDependencyId: number | null;
}

export interface ICalendarRepository {
	/** Sesiones que empiezan en `[from, to)`, ordenadas por inicio. */
	findSessions(
		params: FindCalendarSessionsParams,
	): Promise<CalendarSessionRow[]>;
}
