import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindClassroomModuleQuiz } from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-cursos/:documentId/aula/modulo/:moduleDocumentId
 *
 * La evaluación del módulo, sin respuestas correctas, y dónde cae en el
 * recorrido del aula.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const { documentId, moduleDocumentId } = validateFindClassroomModuleQuiz({
		documentId: params.documentId,
		moduleDocumentId: params.moduleDocumentId,
	});

	const stop = await context.classroomService.findModuleQuiz(
		documentId,
		moduleDocumentId,
		auth,
	);
	if (!stop.success) throw toRouteError(stop.error, CONTENT_ERROR_MESSAGES);

	const view = await context.quizService.findView(
		documentId,
		{ lessonDocumentId: null, moduleDocumentId },
		auth,
	);
	if (!view.success) throw toRouteError(view.error, CONTENT_ERROR_MESSAGES);

	return ok({ ...stop.data, quiz: view.data });
};
