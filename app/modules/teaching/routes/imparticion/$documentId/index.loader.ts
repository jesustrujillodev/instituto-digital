import { RATING_ERROR_MESSAGES } from "@/modules/ratings/utils/rating-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { validateFindTeachingCourse } from "../../../domain/teaching.validators";
import { TEACHING_ERROR_MESSAGES } from "../../../utils/teaching-error-messages";
import { requireTeaching } from "../../require-teaching.server";
import type { Route } from "./+types/index";

/** GET /dashboard/imparticion/:documentId — lista, resultados, cierre y valoraciones. */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireTeaching(request, context);

	const input = parseInput(() => validateFindTeachingCourse(params));
	if (!input.success) throw toRouteError(input.error, TEACHING_ERROR_MESSAGES);
	const { documentId } = input.data;

	const detail = await context.teachingService.findById(documentId, auth);
	if (!detail.success)
		throw toRouteError(detail.error, TEACHING_ERROR_MESSAGES);

	// Las valoraciones se abren al finalizar (§6.10): antes no hay nada que leer.
	const ratings =
		detail.data.course.status === "FINISHED"
			? await context.ratingService.findCourseSummary(documentId, auth)
			: null;
	if (ratings && !ratings.success) {
		throw toRouteError(ratings.error, RATING_ERROR_MESSAGES);
	}

	return ok({
		...detail.data,
		ratings: ratings?.success ? ratings.data : null,
	});
};
