import { requireAuth } from "@/shared/auth/require-auth.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { validateCalendarQuery } from "../../domain/calendar.validators";
import { CALENDAR_ERROR_MESSAGES } from "../../utils/calendar-error-messages";
import type { Route } from "./+types/index";

/** GET /dashboard/calendario */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireAuth(request, context);
	const { searchParams } = new URL(request.url);

	const input = parseInput(() =>
		validateCalendarQuery({
			month: searchParams.get("month") || undefined,
			view: searchParams.get("view") || undefined,
			dependency: searchParams.get("dependency") || undefined,
			modality: searchParams.get("modality") || undefined,
			trainer: searchParams.get("trainer") || undefined,
			staff: searchParams.get("staff") === "1",
		}),
	);
	if (!input.success) {
		throw toRouteError(input.error, CALENDAR_ERROR_MESSAGES);
	}

	const result = await context.calendarService.listSessions(input.data, auth);
	if (!result.success) {
		throw toRouteError(result.error, CALENDAR_ERROR_MESSAGES);
	}

	return ok(result.data);
};
