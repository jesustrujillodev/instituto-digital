import { requireTeaching } from "@/modules/teaching/routes/require-teaching.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateFindEvaluationCourse,
	validateSaveEvaluationResults,
} from "../../../../domain/evaluation.validators";
import { EVALUATION_ERROR_MESSAGES } from "../../../../utils/evaluation-error-messages";
import {
	EVALUATION_INTENTS,
	type EvaluationActionData,
	parseEvaluationFormData,
} from "../../../../utils/evaluation-form";
import type { Route } from "./+types/index";

const savedMessage = (affected: number) =>
	affected === 0
		? "No había cambios que guardar."
		: `Evaluación guardada: ${affected === 1 ? "1 cambio" : `${affected} cambios`}.`;

/**
 * POST /dashboard/imparticion/:documentId/evaluaciones — capturar resultados.
 *
 * Dar de alta, renombrar o quitar una evaluación no se hace al impartir: se
 * define con el curso, en `/dashboard/cursos/:documentId/evaluaciones`.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<EvaluationActionData> => {
	const auth = await requireTeaching(request, context);
	const form = parseEvaluationFormData(await request.formData());

	if (form.intent !== EVALUATION_INTENTS.results) {
		return fail({
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Acción no reconocida.",
		});
	}

	const input = parseInput(() => ({
		courseDocumentId: validateFindEvaluationCourse(params).documentId,
		dto: validateSaveEvaluationResults(form.payload),
	}));
	if (!input.success) return localizeError(input, EVALUATION_ERROR_MESSAGES);

	const result = await context.evaluationService.saveResults(
		input.data.courseDocumentId,
		input.data.dto,
		auth,
	);
	if (!result.success) return localizeError(result, EVALUATION_ERROR_MESSAGES);

	return ok(null, { message: savedMessage(result.data.affected) });
};
