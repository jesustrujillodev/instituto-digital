import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateArchiveModuleQuiz,
	validateFindContentCourse,
	validateFollowUp,
	validateRenameQuiz,
	validateSaveFollowUp,
	validateSaveFollowUpQuestions,
	validateSaveQuiz,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import {
	CONTENT_INTENTS,
	parseContentFormData,
} from "../../../utils/content-form";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/capacitaciones/:documentId/cuestionario — guardar o renombrar el
 * banco, archivar la evaluación de un módulo, o guardar y quitar una
 * evaluación de seguimiento.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs) => {
	const { auth } = await requireCourseScope(request, context);

	const form = parseContentFormData(await request.formData());
	const courseDocumentId = () =>
		validateFindContentCourse({ documentId: params.documentId }).documentId;

	switch (form.intent) {
		case CONTENT_INTENTS.saveQuiz: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateSaveQuiz(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.quizService.saveBank(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Cuestionario guardado." });
		}

		case CONTENT_INTENTS.renameQuiz: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateRenameQuiz(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.quizService.renameQuiz(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Título guardado." });
		}

		case CONTENT_INTENTS.archiveModuleQuiz: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateArchiveModuleQuiz(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.quizService.archiveModuleQuiz(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Cuestionario del módulo eliminado." });
		}

		case CONTENT_INTENTS.saveFollowUp: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateSaveFollowUp(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.quizService.saveFollowUp(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(result.data, {
				message: "Evaluación de seguimiento guardada.",
			});
		}

		case CONTENT_INTENTS.saveFollowUpQuestions: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateSaveFollowUpQuestions(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.quizService.saveFollowUpQuestions(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Preguntas guardadas." });
		}

		case CONTENT_INTENTS.removeFollowUp: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateFollowUp(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.quizService.removeFollowUp(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Evaluación de seguimiento eliminada." });
		}

		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
