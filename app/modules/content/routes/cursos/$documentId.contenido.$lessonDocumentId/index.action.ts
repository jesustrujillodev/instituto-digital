import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateFindContentCourse,
	validateSaveMaterial,
	validateUploadUrl,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import {
	CONTENT_INTENTS,
	parseContentFormData,
} from "../../../utils/content-form";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/cursos/:documentId/contenido/:lessonDocumentId
 *
 * Dos intents: pedir permiso para subir y guardar el material. El archivo nunca
 * pasa por aquí —lo escribe el navegador en el bucket con la URL firmada—, así
 * que el payload sigue siendo un JSON en un solo campo.
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
		case CONTENT_INTENTS.uploadUrl: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateUploadUrl(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.createUploadUrl(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(result.data);
		}

		case CONTENT_INTENTS.saveMaterial: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateSaveMaterial(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await context.contentService.saveMaterial(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Material guardado." });
		}

		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
