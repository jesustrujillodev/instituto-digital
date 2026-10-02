import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import type { ICradle } from "@/shared/di/container.types";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateApplyTemplate,
	validateCertificateCourse,
	validateSaveCertificateDelivery,
	validateSaveCertificateDraft,
	validateTemplateFromCourse,
} from "../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../utils/certificate-error-messages";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	parseCertificateFormData,
} from "../../utils/certificate-form";

const missing = (message: string): CertificateActionData =>
	fail({ code: RESPONSE_ERROR_CODES.VALIDATION, message });

/**
 * El action del certificado de un curso, compartido por la ficha y el editor.
 *
 * Guardar y publicar reciben el diseño de la pantalla; publicar lo guarda
 * además (docs/adr/0023). Descartar no recibe diseño: vuelve al publicado. Las
 * subidas devuelven la referencia, que entra al diseño al guardarse.
 */
export const handleCertificateAction = async ({
	request,
	context,
	params,
}: {
	request: Request;
	context: ICradle;
	params: { documentId?: string };
}): Promise<CertificateActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const form = parseCertificateFormData(await request.formData());
	const course = parseInput(
		() =>
			validateCertificateCourse({ documentId: params.documentId }).documentId,
	);
	if (!course.success) return localizeError(course, CERTIFICATE_ERROR_MESSAGES);

	const service = context.certificateService;

	switch (form.intent) {
		case CERTIFICATE_INTENTS.saveDraft:
		case CERTIFICATE_INTENTS.publish: {
			const input = parseInput(() =>
				validateSaveCertificateDraft({
					documentId: course.data,
					design: form.payload,
				}),
			);
			if (!input.success) {
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			}

			const isPublish = form.intent === CERTIFICATE_INTENTS.publish;
			const result = isPublish
				? await service.publish(input.data, auth)
				: await service.saveDraft(input.data, auth);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(null, {
				message: isPublish
					? "Certificado publicado. Se emitirá con este diseño."
					: "Borrador guardado. Publícalo para que se emita con él.",
			});
		}
		case CERTIFICATE_INTENTS.discard: {
			const result = await service.discardDraft(course.data, auth);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(null, { message: "Se restauró el certificado publicado." });
		}
		case CERTIFICATE_INTENTS.saveDelivery: {
			// El curso sale de la URL y se pone al final: el cuerpo no lo cambia.
			const input = parseInput(() =>
				validateSaveCertificateDelivery({
					...(form.payload as object | null),
					documentId: course.data,
				}),
			);
			if (!input.success) {
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			}

			const result = await service.saveDelivery(input.data, auth);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(null, { message: "Entrega guardada." });
		}
		case CERTIFICATE_INTENTS.uploadImage: {
			if (!form.file) return missing("Elige la imagen.");

			const result = await service.uploadImage(course.data, form.file, auth);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(result.data, { message: "Imagen subida." });
		}
		case CERTIFICATE_INTENTS.uploadBackground: {
			if (!form.pdf || !form.raster || !form.rasterDpi) {
				return missing("Elige el PDF de fondo.");
			}

			const result = await service.uploadBackground(
				{
					documentId: course.data,
					pdf: form.pdf,
					raster: form.raster,
					rasterDpi: form.rasterDpi,
				},
				auth,
			);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(result.data, { message: "Fondo cargado." });
		}
		case CERTIFICATE_INTENTS.applyTemplate: {
			const input = parseInput(() =>
				validateApplyTemplate({
					courseDocumentId: course.data,
					templateDocumentId: form.payload,
				}),
			);
			if (!input.success) {
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			}
			const result = await context.certificateTemplateService.apply(
				input.data,
				auth,
			);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(
				{ applied: result.data },
				{ message: "Plantilla aplicada. Guarda para conservarla." },
			);
		}
		case CERTIFICATE_INTENTS.saveAsTemplate: {
			const input = parseInput(() =>
				validateTemplateFromCourse({
					...(form.payload as object | null),
					courseDocumentId: course.data,
				}),
			);
			if (!input.success) {
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			}
			const result = await context.certificateTemplateService.fromCourse(
				input.data,
				auth,
			);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(result.data, {
				message: "Guardado en la biblioteca, sin las firmas.",
			});
		}
		default:
			return missing("Acción no reconocida.");
	}
};
