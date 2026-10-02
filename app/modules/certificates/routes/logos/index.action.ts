import { requireRole } from "@/shared/auth/require-role.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateArchiveLogo,
	validateLogoTarget,
	validateUploadLogo,
} from "../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../utils/certificate-error-messages";
import { LOGO_INTENTS, type LogoActionData } from "../../utils/logo-form";
import type { Route } from "./+types/index";

const missing = (message: string): LogoActionData =>
	fail({ code: RESPONSE_ERROR_CODES.VALIDATION, message });

const fileOf = (form: FormData) => {
	const value = form.get("file");
	return value instanceof File && value.size > 0 ? value : null;
};

/**
 * POST /dashboard/logos-institucionales: subir, reemplazar, archivar y
 * restaurar. Reemplazar crea otro logo: los certificados emitidos conservan
 * el anterior.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<LogoActionData> => {
	const auth = await requireRole(request, context, ["SUPERADMIN"]);
	const form = await request.formData();
	const service = context.certificateLogoService;

	switch (form.get("intent")) {
		case LOGO_INTENTS.upload: {
			const input = parseInput(() =>
				validateUploadLogo({ name: form.get("name") }),
			);
			if (!input.success)
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			const file = fileOf(form);
			if (!file) return missing("Elige el archivo del logo.");

			const result = await service.upload(input.data.name, file, auth);
			if (!result.success)
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			return ok(result.data, { message: "Logo subido." });
		}
		case LOGO_INTENTS.replace: {
			const input = parseInput(() =>
				validateLogoTarget({ documentId: form.get("documentId") }),
			);
			if (!input.success)
				return localizeError(input, CERTIFICATE_ERROR_MESSAGES);
			const file = fileOf(form);
			if (!file) return missing("Elige el archivo del logo.");

			const result = await service.replace(input.data.documentId, file, auth);
			if (!result.success)
				return localizeError(result, CERTIFICATE_ERROR_MESSAGES);
			return ok(result.data, {
				message:
					"Logo reemplazado. Los certificados emitidos conservan el anterior.",
			});
		}
		case LOGO_INTENTS.archive: {
			const input = parseInput(() =>
				validateArchiveLogo({
					documentId: form.get("documentId"),
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
				message: input.data.archived ? "Logo archivado." : "Logo restaurado.",
			});
		}
		default:
			return missing("Acción no reconocida.");
	}
};
