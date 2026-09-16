import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { CalendarQueryDto, CalendarResponse } from "./calendar.types";

/** Lectura del calendario. Lo que devuelve depende de quién consulta (§6.7). */
export interface ICalendarService {
	listSessions(
		query: CalendarQueryDto,
		actor: AuthContext,
	): Promise<CalendarResponse>;
}
