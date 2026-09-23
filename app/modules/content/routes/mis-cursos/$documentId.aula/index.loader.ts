import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindClassroom } from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-cursos/:documentId/aula
 *
 * El índice del aula con el estado de cada lección. Registrar avance vuelve a
 * validar este loader, y así el índice se entera sin pedírselo.
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

	const classroom = await context.classroomService.findClassroom(
		documentId,
		auth,
	);
	if (!classroom.success) {
		throw toRouteError(classroom.error, CONTENT_ERROR_MESSAGES);
	}

	return ok(classroom.data);
};
