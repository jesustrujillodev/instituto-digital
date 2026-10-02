import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateSaveTemplateDesign,
	validateTemplateTarget,
} from "../../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import {
	CERTIFICATE_INTENTS,
	parseCertificateFormData,
} from "../../../utils/certificate-form";
import type { TemplateActionData } from "../../../utils/template-form";
import type { Route } from "./+types/index";

const missing = (message: string): TemplateActionData =>
	fail({ code: RESPONSE_ERROR_CODES.VALIDATION, message });

/**
 * POST del editor de una plantilla: guardar su diseño y subir imágenes o
 * fondos a su carpeta. Usa las mismas intenciones que el editor del curso,
 * así el editor no distingue a quién guarda.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<TemplateActionData> => {
	const { auth } = await requireCourseScope(request, context);
	const form = parseCertificateFormData(await request.formData());
	const target = parseInput(() =>
		validateTemplateTarget({ documentId: params.documentId }),
	);
	if (!target.success) return localizeError(target, CERTIFICATE_ERROR_MESSAGES);
	const { documentId } = target.data;
	const service = context.certificateTemplateService;

	switch (form.intent) {
		case CERTIFICATE_INTENTS.saveDraft: {
			const input = parseInput(() =>
				validateSaveTemplateDesign({ documentId, design: form.payload }),
			);
			if (!input.success)
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			const result = await service.saveDesign(input.data, auth);
			if (!result.success)
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			return ok(null, { message: "Plantilla guardada." });
		}
		case CERTIFICATE_INTENTS.uploadImage: {
			if (!form.file) return missing("Elige la imagen.");
			const result = await service.uploadImage(documentId, form.file, auth);
			if (!result.success)
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			return ok(result.data, { message: "Imagen subida." });
		}
		case CERTIFICATE_INTENTS.uploadBackground: {
			if (!form.pdf || !form.raster || !form.rasterDpi) {
				return missing("Elige el PDF de fondo.");
			}
			const result = await service.uploadBackground(
				{
					documentId,
					pdf: form.pdf,
					raster: form.raster,
					rasterDpi: form.rasterDpi,
				},
				auth,
			);
			if (!result.success)
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			return ok(result.data, { message: "Fondo cargado." });
		}
		default:
			return missing("Acción no reconocida.");
	}
};
