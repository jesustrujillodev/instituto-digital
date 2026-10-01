import { requireTeaching } from "@/modules/teaching/routes/require-teaching.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateFindContentCourse,
	validateFollowUp,
	validateGrantRetake,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import {
	CONTENT_INTENTS,
	parseContentFormData,
} from "../../../utils/content-form";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/imparticion/:documentId/cuestionarios — habilitar otro
 * intento a quien reprobó, o abrir y cerrar a mano una evaluación de
 * seguimiento (docs/adr/0027).
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs) => {
	const auth = await requireTeaching(request, context);
	const form = parseContentFormData(await request.formData());
	const courseDocumentId = () =>
		validateFindContentCourse({ documentId: params.documentId }).documentId;

	switch (form.intent) {
		case CONTENT_INTENTS.grantRetake: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateGrantRetake(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.quizService.grantRetake(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Otro intento habilitado." });
		}

		case CONTENT_INTENTS.openFollowUp:
		case CONTENT_INTENTS.closeFollowUp: {
			const opens = form.intent === CONTENT_INTENTS.openFollowUp;
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateFollowUp(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = opens
				? await context.quizService.openFollowUp(
						input.data.course,
						input.data.dto,
						auth,
					)
				: await context.quizService.closeFollowUp(
						input.data.course,
						input.data.dto,
						auth,
					);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, {
				message: opens ? "Evaluación abierta." : "Evaluación cerrada.",
			});
		}

		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
