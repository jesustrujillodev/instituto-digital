import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import {
	requiresContent,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import { EVALUATION_ERROR_MESSAGES } from "@/modules/evaluations/utils/evaluation-error-messages";
import { RATING_ERROR_MESSAGES } from "@/modules/ratings/utils/rating-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { validateFindTeachingCourse } from "../../../domain/teaching.validators";
import { TEACHING_ERROR_MESSAGES } from "../../../utils/teaching-error-messages";
import { requireTeaching } from "../../require-teaching.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/imparticion/:documentId — lista, evaluaciones, evaluaciones de
 * módulo, cierre y valoraciones.
 */
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
	// Un autogestivo no se finaliza, y cada quien valora al completarlo.
	const { course } = detail.data;
	const ratings =
		course.status === "FINISHED" || !requiresSessions(course.format)
			? await context.ratingService.findCourseSummary(documentId, auth)
			: null;
	if (ratings && !ratings.success) {
		throw toRouteError(ratings.error, RATING_ERROR_MESSAGES);
	}

	// Las de seguimiento solo existen si el curso evalúa y tiene quién las
	// capture: un autogestivo no tiene capacitador.
	const evaluations =
		course.requiresEvaluation && requiresSessions(course.format)
			? await context.evaluationService.findCourseBoard(documentId, auth)
			: null;
	if (evaluations && !evaluations.success) {
		throw toRouteError(evaluations.error, EVALUATION_ERROR_MESSAGES);
	}

	// Las evaluaciones de módulo cuentan donde cuenta el temario.
	const moduleQuizzes = requiresContent(course)
		? await context.quizService.findModuleQuizBoard(documentId, auth)
		: null;
	if (moduleQuizzes && !moduleQuizzes.success) {
		throw toRouteError(moduleQuizzes.error, CONTENT_ERROR_MESSAGES);
	}

	return ok({
		...detail.data,
		ratings: ratings?.success ? ratings.data : null,
		evaluations: evaluations?.success ? evaluations.data : null,
		moduleQuizzes:
			moduleQuizzes?.success && moduleQuizzes.data.quizzes.length > 0
				? moduleQuizzes.data
				: null,
	});
};
