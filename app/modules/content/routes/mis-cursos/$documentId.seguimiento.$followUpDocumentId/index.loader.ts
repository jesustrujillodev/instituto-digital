import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import {
	validateFindClassroom,
	validateFollowUp,
} from "../../../domain/content.validators";
import { followUpOwnerOf } from "../../../domain/quiz.rules";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-capacitaciones/:documentId/seguimiento/:followUpDocumentId
 *
 * Una evaluación de seguimiento, sin respuestas correctas. `null` si todavía
 * no tiene preguntas.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const input = parseInput(() => ({
		course: validateFindClassroom({ documentId: params.documentId }).documentId,
		followUp: validateFollowUp({
			followUpDocumentId: params.followUpDocumentId,
		}).followUpDocumentId,
	}));
	if (!input.success) throw toRouteError(input.error, CONTENT_ERROR_MESSAGES);

	const view = await context.quizService.findView(
		input.data.course,
		followUpOwnerOf(input.data.followUp),
		auth,
	);
	if (!view.success) throw toRouteError(view.error, CONTENT_ERROR_MESSAGES);

	return ok({ courseDocumentId: input.data.course, view: view.data });
};
