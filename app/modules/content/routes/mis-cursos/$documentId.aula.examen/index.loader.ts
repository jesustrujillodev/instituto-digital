import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindClassroom } from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-cursos/:documentId/aula/examen
 *
 * El examen final, sin respuestas correctas. `null` si el curso no se evalúa
 * con examen o todavía no tiene preguntas.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const { documentId } = validateFindClassroom({
		documentId: params.documentId,
	});

	const view = await context.quizService.findView(documentId, null, auth);
	if (!view.success) throw toRouteError(view.error, CONTENT_ERROR_MESSAGES);

	return ok(view.data);
};
