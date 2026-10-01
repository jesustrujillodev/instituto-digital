import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import {
	validateFindClassroom,
	validateSubmitQuiz,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import { parseContentFormData } from "../../../utils/content-form";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/mis-capacitaciones/:documentId/seguimiento/:followUpDocumentId
 *
 * Presenta la evaluación de seguimiento. La ventana, la asistencia y los
 * intentos se imponen en el servicio.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs) => {
	const auth = await requireParticipant(request, context);
	const form = parseContentFormData(await request.formData());

	const input = parseInput(() => ({
		course: validateFindClassroom({ documentId: params.documentId }).documentId,
		// La ruta nombra la evaluación: el dueño no lo decide el cliente.
		dto: validateSubmitQuiz({
			...(form.payload as object),
			lessonDocumentId: null,
			moduleDocumentId: null,
			followUpDocumentId: params.followUpDocumentId,
		}),
	}));
	if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

	const result = await context.quizService.submit(
		input.data.course,
		input.data.dto,
		auth,
	);
	if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

	return ok(result.data, {
		message: result.data.passed
			? `Aprobaste con ${result.data.score}.`
			: `Obtuviste ${result.data.score}; el mínimo era ${result.data.passingScore}.`,
	});
};
