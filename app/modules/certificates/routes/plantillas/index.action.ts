import { redirect } from "react-router";
import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateArchiveTemplate,
	validateCreateTemplate,
	validateRenameTemplate,
} from "../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../utils/certificate-error-messages";
import {
	TEMPLATE_INTENTS,
	type TemplateActionData,
	templateEditorPath,
} from "../../utils/template-form";
import type { Route } from "./+types/index";

const text = (form: FormData, field: string) => {
	const value = form.get(field);
	return typeof value === "string" ? value : null;
};

/** POST /dashboard/plantillas-de-certificado: crear (abre su editor), renombrar y archivar. */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<TemplateActionData | Response> => {
	const { auth } = await requireCourseScope(request, context);
	const form = await request.formData();
	const service = context.certificateTemplateService;

	switch (form.get("intent")) {
		case TEMPLATE_INTENTS.create: {
			const input = parseInput(() =>
				validateCreateTemplate({
					name: text(form, "name"),
					description: text(form, "description"),
				}),
			);
			if (!input.success)
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			const result = await service.create(input.data, auth);
			if (!result.success)
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			return redirect(templateEditorPath(result.data.documentId));
		}
		case TEMPLATE_INTENTS.rename: {
			const input = parseInput(() =>
				validateRenameTemplate({
					documentId: text(form, "documentId"),
					name: text(form, "name"),
					description: text(form, "description"),
				}),
			);
			if (!input.success)
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			const result = await service.rename(input.data, auth);
			if (!result.success)
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			return ok(null, { message: "Plantilla actualizada." });
		}
		case TEMPLATE_INTENTS.archive: {
			const input = parseInput(() =>
				validateArchiveTemplate({
					documentId: text(form, "documentId"),
					archived: form.get("archived") === "true",
				}),
			);
			if (!input.success)
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			const result = await service.setArchived(
				input.data.documentId,
				input.data.archived,
				auth,
			);
			if (!result.success)
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			return ok(null, {
				message: input.data.archived
					? "Plantilla archivada."
					: "Plantilla restaurada.",
			});
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
