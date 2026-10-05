import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateCreateLesson,
	validateCreateModule,
	validateDeleteLesson,
	validateDeleteModule,
	validateFindContentCourse,
	validateReorderContent,
	validateUpdateLesson,
	validateUpdateModule,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	parseContentFormData,
} from "../../../utils/content-form";
import type { Route } from "./+types/index";

/** POST /dashboard/capacitaciones/:documentId/contenido — el temario, cambio a cambio. */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<ContentActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const form = parseContentFormData(await request.formData());
	const courseDocumentId = () => validateFindContentCourse(params).documentId;

	switch (form.intent) {
		case CONTENT_INTENTS.createModule: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateCreateModule(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.createModule(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(result.data, { message: "Módulo añadido." });
		}
		case CONTENT_INTENTS.updateModule: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateUpdateModule(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.updateModule(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Módulo actualizado." });
		}
		case CONTENT_INTENTS.deleteModule: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateDeleteModule(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.deleteModule(
				input.data.course,
				input.data.dto.moduleDocumentId,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Módulo eliminado." });
		}
		case CONTENT_INTENTS.createLesson: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateCreateLesson(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.createLesson(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(result.data, { message: "Lección añadida." });
		}
		case CONTENT_INTENTS.updateLesson: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateUpdateLesson(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.updateLesson(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Lección actualizada." });
		}
		case CONTENT_INTENTS.deleteLesson: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateDeleteLesson(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.deleteLesson(
				input.data.course,
				input.data.dto.lessonDocumentId,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Lección eliminada." });
		}
		case CONTENT_INTENTS.reorder: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateReorderContent(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.reorder(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Orden guardado." });
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
