import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { readViewMode, VIEW_MODE_SCREENS } from "@/shared/view-mode/view-mode";
import { ENROLLMENT_ERROR_MESSAGES } from "../../utils/enrollment-error-messages";
import { requireParticipant } from "../require-participant.server";
import type { Route } from "./+types/index";

/** GET /dashboard/mis-cursos */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);

	const result = await context.enrollmentService.listMine(auth);
	if (!result.success) {
		throw toRouteError(result.error, ENROLLMENT_ERROR_MESSAGES);
	}

	return ok({
		...result.data,
		view: readViewMode(request.headers.get("Cookie"), VIEW_MODE_SCREENS.mine),
	});
};
