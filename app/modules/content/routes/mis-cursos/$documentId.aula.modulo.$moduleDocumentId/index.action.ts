import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import {
	validateFindClassroomModuleQuiz,
	validateSubmitQuiz,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import { parseContentFormData } from "../../../utils/content-form";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/mis-cursos/:documentId/aula/modulo/:moduleDocumentId
 *
 * Presenta la evaluación del módulo. La inscripción y el intento disponible se
 * imponen en el servicio.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs) => {
	const auth = await requireParticipant(request, context);
	const form = parseContentFormData(await request.formData());

	const input = parseInput(() => {
		const { documentId, moduleDocumentId } = validateFindClassroomModuleQuiz({
			documentId: params.documentId,
			moduleDocumentId: params.moduleDocumentId,
		});

		return {
			course: documentId,
			// El módulo sale de la URL, no del cuerpo.
			dto: validateSubmitQuiz({
				...(form.payload as object),
				lessonDocumentId: null,
				moduleDocumentId,
			}),
		};
	});
	if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

	const result = await context.quizService.submit(
		input.data.course,
		input.data.dto,
		auth,
	);
	if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

	return ok(result.data, {
		message: result.data.passed
			? `Aprobaste el módulo con ${result.data.score}.`
			: `Obtuviste ${result.data.score}; el mínimo era ${result.data.passingScore}.`,
	});
};
