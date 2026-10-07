import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	CalendarQueryDto,
	CalendarResponse,
	CalendarWeek,
} from "./calendar.types";

/** Lectura del calendario. Lo que devuelve depende de quién consulta (§6.7). */
export interface ICalendarService {
	listSessions(
		query: CalendarQueryDto,
		actor: AuthContext,
	): Promise<CalendarResponse>;
	/** Hoy y los seis días siguientes, con un tope de sesiones. */
	listWeek(
		actor: AuthContext,
		options: { limit: number },
	): Promise<AppResponse<CalendarWeek>>;
}
