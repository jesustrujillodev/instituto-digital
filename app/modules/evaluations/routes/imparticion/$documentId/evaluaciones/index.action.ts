import { requireTeaching } from "@/modules/teaching/routes/require-teaching.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateCreateEvaluation,
	validateFindEvaluationCourse,
	validateRemoveEvaluation,
	validateSaveEvaluationResults,
	validateUpdateEvaluation,
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

/** POST /dashboard/imparticion/:documentId/evaluaciones */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<EvaluationActionData> => {
	const auth = await requireTeaching(request, context);
	const form = parseEvaluationFormData(await request.formData());
	const courseDocumentId = () =>
		validateFindEvaluationCourse(params).documentId;

	switch (form.intent) {
		case EVALUATION_INTENTS.create: {
			const input = parseInput(() => ({
				courseDocumentId: courseDocumentId(),
				dto: validateCreateEvaluation(form.payload),
			}));
			if (!input.success)
				return localizeError(input, EVALUATION_ERROR_MESSAGES);

			const result = await context.evaluationService.create(
				input.data.courseDocumentId,
				input.data.dto,
				auth,
			);
			if (!result.success)
				return localizeError(result, EVALUATION_ERROR_MESSAGES);

			return ok(null, { message: "Evaluación añadida." });
		}
		case EVALUATION_INTENTS.update: {
			const input = parseInput(() => ({
				courseDocumentId: courseDocumentId(),
				dto: validateUpdateEvaluation(form.payload),
			}));
			if (!input.success)
				return localizeError(input, EVALUATION_ERROR_MESSAGES);

			const { evaluationDocumentId, ...dto } = input.data.dto;
			const result = await context.evaluationService.update(
				input.data.courseDocumentId,
				evaluationDocumentId,
				dto,
				auth,
			);
			if (!result.success)
				return localizeError(result, EVALUATION_ERROR_MESSAGES);

			return ok(null, { message: "Evaluación actualizada." });
		}
		case EVALUATION_INTENTS.remove: {
			const input = parseInput(() => ({
				courseDocumentId: courseDocumentId(),
				dto: validateRemoveEvaluation(form.payload),
			}));
			if (!input.success)
				return localizeError(input, EVALUATION_ERROR_MESSAGES);

			const result = await context.evaluationService.remove(
				input.data.courseDocumentId,
				input.data.dto.evaluationDocumentId,
				auth,
			);
			if (!result.success)
				return localizeError(result, EVALUATION_ERROR_MESSAGES);

			return ok(null, {
				message: "Evaluación eliminada, junto con lo capturado en ella.",
			});
		}
		case EVALUATION_INTENTS.results: {
			const input = parseInput(() => ({
				courseDocumentId: courseDocumentId(),
				dto: validateSaveEvaluationResults(form.payload),
			}));
			if (!input.success)
				return localizeError(input, EVALUATION_ERROR_MESSAGES);

			const result = await context.evaluationService.saveResults(
				input.data.courseDocumentId,
				input.data.dto,
				auth,
			);
			if (!result.success)
				return localizeError(result, EVALUATION_ERROR_MESSAGES);

			return ok(null, { message: savedMessage(result.data.affected) });
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
