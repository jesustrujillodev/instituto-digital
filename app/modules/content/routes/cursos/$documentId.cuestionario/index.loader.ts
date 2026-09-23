import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	validateFindContentCourse,
	validateFindQuiz,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import { LESSON_PARAM, MODULE_PARAM } from "../../../utils/content-form";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId/cuestionario[?leccion=…|?modulo=…]
 *
 * El banco con sus respuestas correctas: solo para quien administra el curso.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth } = await requireCourseScope(request, context);

	const { documentId } = validateFindContentCourse({
		documentId: params.documentId,
	});
	const { searchParams } = new URL(request.url);
	const owner = validateFindQuiz({
		lessonDocumentId: searchParams.get(LESSON_PARAM),
		moduleDocumentId: searchParams.get(MODULE_PARAM),
	});

	const bank = await context.quizService.findBank(documentId, owner, auth);
	if (!bank.success) throw toRouteError(bank.error, CONTENT_ERROR_MESSAGES);

	return ok(bank.data);
};
