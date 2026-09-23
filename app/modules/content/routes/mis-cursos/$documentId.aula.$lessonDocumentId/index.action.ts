import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import {
	validateFindClassroom,
	validateRecordProgress,
	validateSubmitQuiz,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import {
	CONTENT_INTENTS,
	parseContentFormData,
} from "../../../utils/content-form";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/mis-cursos/:documentId/aula/:lessonDocumentId
 *
 * Registra el avance de quien está en sesión, o presenta la práctica de una
 * lección `QUIZ`. La inscripción activa se exige en el servicio: esconder el
 * botón no protege a nadie de un POST directo.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs) => {
	const auth = await requireParticipant(request, context);
	const formData = await request.formData();

	const form = parseContentFormData(formData);
	if (form.intent === CONTENT_INTENTS.submitQuiz) {
		const quizInput = parseInput(() => ({
			course: validateFindClassroom({ documentId: params.documentId })
				.documentId,
			// La lección sale de la URL, no del cuerpo.
			dto: validateSubmitQuiz({
				...(form.payload as object),
				lessonDocumentId: params.lessonDocumentId,
				moduleDocumentId: null,
			}),
		}));
		if (!quizInput.success) {
			return localizeError(quizInput, CONTENT_ERROR_MESSAGES);
		}

		const submitted = await context.quizService.submit(
			quizInput.data.course,
			quizInput.data.dto,
			auth,
		);
		if (!submitted.success) {
			return localizeError(submitted, CONTENT_ERROR_MESSAGES);
		}

		return ok(submitted.data, {
			message: `Cuestionario enviado: obtuviste ${submitted.data.score}.`,
		});
	}

	const input = parseInput(() => ({
		course: validateFindClassroom({ documentId: params.documentId }).documentId,
		dto: validateRecordProgress({
			lessonDocumentId: params.lessonDocumentId,
			status: formData.get("status"),
		}),
	}));
	if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

	const result = await context.classroomService.recordProgress(
		input.data.course,
		input.data.dto,
		auth,
	);
	if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

	// Abrir una lección no se anuncia; completarla sí.
	if (input.data.dto.status !== "COMPLETED") return ok(result.data);

	return ok(result.data, {
		message: result.data.contentCompleted
			? "Terminaste el contenido del curso."
			: "Lección completada.",
	});
};
