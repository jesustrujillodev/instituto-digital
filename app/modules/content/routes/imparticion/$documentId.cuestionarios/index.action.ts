import { requireTeaching } from "@/modules/teaching/routes/require-teaching.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateFindContentCourse,
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
 * intento de una evaluación de módulo a quien la reprobó.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs) => {
	const auth = await requireTeaching(request, context);
	const form = parseContentFormData(await request.formData());

	if (form.intent !== CONTENT_INTENTS.grantRetake) {
		return fail({
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Acción no reconocida.",
		});
	}

	const input = parseInput(() => ({
		course: validateFindContentCourse({ documentId: params.documentId })
			.documentId,
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
};
