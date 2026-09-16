import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import {
	validateFindRatingCourse,
	validateRateCourse,
} from "../../domain/rating.validators";
import { RATING_ERROR_MESSAGES } from "../../utils/rating-error-messages";
import {
	parseRatingFormData,
	type RatingActionData,
} from "../../utils/rating-form";
import type { Route } from "./+types/index";

/** POST /dashboard/mis-cursos/:documentId/valorar */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<RatingActionData> => {
	const auth = await requireParticipant(request, context);
	const form = parseRatingFormData(await request.formData());

	const input = parseInput(() => ({
		documentId: validateFindRatingCourse(params).documentId,
		dto: validateRateCourse(form),
	}));
	if (!input.success) return localizeError(input, RATING_ERROR_MESSAGES);

	const result = await context.ratingService.rate(
		input.data.documentId,
		input.data.dto,
		auth,
	);
	if (!result.success) return localizeError(result, RATING_ERROR_MESSAGES);

	return ok(null, { message: "Gracias por valorar el curso." });
};
