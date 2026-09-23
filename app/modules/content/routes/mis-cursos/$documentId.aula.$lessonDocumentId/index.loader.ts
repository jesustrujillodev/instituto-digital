import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindClassroomLesson } from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-cursos/:documentId/aula/:lessonDocumentId
 *
 * Solo lee. Abrir la lección se registra con un POST aparte: un loader que
 * escribe se dispararía también al precargar el enlace.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const { documentId, lessonDocumentId } = validateFindClassroomLesson({
		documentId: params.documentId,
		lessonDocumentId: params.lessonDocumentId,
	});

	const lesson = await context.classroomService.findLesson(
		documentId,
		lessonDocumentId,
		auth,
	);
	if (!lesson.success) throw toRouteError(lesson.error, CONTENT_ERROR_MESSAGES);

	// La práctica viaja sin respuestas correctas, y solo en su lección.
	const quiz =
		lesson.data.lesson.type === "QUIZ"
			? await context.quizService.findView(
					documentId,
					{ lessonDocumentId, moduleDocumentId: null },
					auth,
				)
			: null;
	if (quiz && !quiz.success)
		throw toRouteError(quiz.error, CONTENT_ERROR_MESSAGES);

	return ok({ ...lesson.data, quiz: quiz?.success ? quiz.data : null });
};
