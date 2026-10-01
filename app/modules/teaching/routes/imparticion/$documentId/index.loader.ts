import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import {
	evaluatesByQuiz,
	gradesAutomatically,
	requiresContent,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import { RATING_ERROR_MESSAGES } from "@/modules/ratings/utils/rating-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { validateFindTeachingCourse } from "../../../domain/teaching.validators";
import { TEACHING_ERROR_MESSAGES } from "../../../utils/teaching-error-messages";
import { requireTeaching } from "../../require-teaching.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/imparticion/:documentId — lista, evaluaciones, intentos de
 * los cuestionarios, cierre y valoraciones.
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

	const { course } = detail.data;

	// Todo depende solo del curso: va en paralelo.
	const [ratings, followUps, quizBoard] = await Promise.all([
		// Las valoraciones se abren al finalizar (§6.10): antes no hay nada que
		// leer. Un autogestivo no se finaliza, y cada quien valora al completarlo.
		course.status === "FINISHED" || !requiresSessions(course.format)
			? context.ratingService.findCourseSummary(documentId, auth)
			: null,
		// El seguimiento cuelga de las sesiones: un autogestivo no lo tiene.
		requiresSessions(course.format)
			? context.quizService.findFollowUpBoard(documentId, auth)
			: null,
		// Los cuestionarios cuentan donde cuenta el temario, se evalúa con examen
		// o hay seguimiento.
		requiresContent(course) ||
		evaluatesByQuiz(course) ||
		requiresSessions(course.format)
			? context.quizService.findQuizBoard(documentId, auth)
			: null,
	]);

	if (ratings && !ratings.success) {
		throw toRouteError(ratings.error, RATING_ERROR_MESSAGES);
	}
	if (followUps && !followUps.success) {
		throw toRouteError(followUps.error, CONTENT_ERROR_MESSAGES);
	}
	if (quizBoard && !quizBoard.success) {
		throw toRouteError(quizBoard.error, CONTENT_ERROR_MESSAGES);
	}

	return ok({
		...detail.data,
		ratings: ratings?.success ? ratings.data : null,
		followUps:
			followUps?.success && followUps.data.followUps.length > 0
				? followUps.data
				: null,
		// La pestaña Resultados existe donde la nota se calcula sola.
		gradesAutomatically: gradesAutomatically(
			course,
			followUps?.success
				? followUps.data.followUps.filter(
						(followUp) => followUp.countsTowardGrade,
					).length
				: 0,
		),
		quizBoard:
			quizBoard?.success && quizBoard.data.quizzes.length > 0
				? quizBoard.data
				: null,
	});
};
