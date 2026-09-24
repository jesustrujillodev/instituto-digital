import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateCertificateCourse,
	validateSaveCertificateDelivery,
	validateSaveCertificateDraft,
} from "../../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	parseCertificateFormData,
} from "../../../utils/certificate-form";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/cursos/:documentId/certificado.
 *
 * Publicar y descartar no reciben diseño: trabajan sobre lo que ya está
 * guardado, así que un diseño en el cuerpo de esas peticiones ni se lee.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<CertificateActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const form = parseCertificateFormData(await request.formData());
	const course = parseInput(
		() =>
			validateCertificateCourse({ documentId: params.documentId }).documentId,
	);
	if (!course.success) return localizeError(course, CERTIFICATE_ERROR_MESSAGES);

	const service = context.certificateService;

	switch (form.intent) {
		case CERTIFICATE_INTENTS.saveDraft: {
			const input = parseInput(() =>
				validateSaveCertificateDraft({
					documentId: course.data,
					design: form.payload,
				}),
			);
			if (!input.success) {
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			}

			const result = await service.saveDraft(input.data, auth);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(null, { message: "Certificado guardado." });
		}
		case CERTIFICATE_INTENTS.publish: {
			const result = await service.publish(course.data, auth);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(null, { message: "Certificado publicado." });
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
		case CERTIFICATE_INTENTS.uploadSignature: {
			if (!form.file) {
				return fail({
					code: RESPONSE_ERROR_CODES.VALIDATION,
					message: "Elige la imagen de la firma.",
				});
			}

			const result = await service.uploadSignature(
				course.data,
				form.file,
				auth,
			);
			if (!result.success) {
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			}
			return ok(result.data, { message: "Firma subida." });
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
