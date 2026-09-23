import { redirect } from "react-router";
import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { toRouteError } from "@/shared/http/route-error";
import { validateFindClassroom } from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import { examPath, stopPath } from "../../../utils/content-form";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-cursos/:documentId/aula (índice)
 *
 * «Continuar donde lo dejaste»: manda a lo primero que cuenta y falta, sea una
 * obligatoria o la evaluación de un módulo.
 * Solo se queda aquí con el temario vacío.
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

	const { resume } = classroom.data;
	if (resume) throw redirect(stopPath(documentId, resume));
	// Sin temario, el aula es solo el examen: un presencial evaluado en línea.
	if (classroom.data.finalQuiz) throw redirect(examPath(documentId));

	return null;
};
