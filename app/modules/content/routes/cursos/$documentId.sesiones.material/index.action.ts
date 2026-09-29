import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateCreateSessionMaterial,
	validateFindSessionMaterials,
	validateRemoveSessionMaterial,
	validateSessionUploadUrl,
	validateUpdateSessionMaterial,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import {
	CONTENT_INTENTS,
	parseContentFormData,
} from "../../../utils/content-form";
import { requireSessionMaterialScope } from "../../require-session-material.server";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/cursos/:documentId/sesiones/material
 *
 * Pedir permiso para subir, agregar, editar y quitar. El archivo nunca pasa
 * por aquí: lo escribe el navegador en el bucket con la URL firmada.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs) => {
	const auth = await requireSessionMaterialScope(request, context);

	const form = parseContentFormData(await request.formData());
	const courseDocumentId = () =>
		validateFindSessionMaterials({ documentId: params.documentId }).documentId;
	const service = context.sessionMaterialService;

	switch (form.intent) {
		case CONTENT_INTENTS.uploadUrl: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateSessionUploadUrl(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await service.createUploadUrl(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(result.data);
		}

		case CONTENT_INTENTS.createSessionMaterial: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateCreateSessionMaterial(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await service.create(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Material agregado." });
		}

		case CONTENT_INTENTS.updateSessionMaterial: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateUpdateSessionMaterial(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await service.update(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Material actualizado." });
		}

		case CONTENT_INTENTS.removeSessionMaterial: {
			const input = parseInput(() => ({
				course: courseDocumentId(),
				dto: validateRemoveSessionMaterial(form.payload),
			}));
			if (!input.success) return localizeError(input, CONTENT_ERROR_MESSAGES);

			const result = await service.remove(
				input.data.course,
				input.data.dto,
				auth,
			);
			if (!result.success) return localizeError(result, CONTENT_ERROR_MESSAGES);

			return ok(null, { message: "Material quitado." });
		}

		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
