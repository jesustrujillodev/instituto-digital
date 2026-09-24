import { requireAuth } from "@/shared/auth/require-auth.server";
import { toRouteError } from "@/shared/http/route-error";
import { parseInput } from "@/shared/response/response.helpers";
import { validateDownloadCertificate } from "../../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import { toDownloadResponse } from "../../download-response";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-certificados/:documentId/descargar?formato=pdf|png
 *
 * La descarga del propio certificado. Solo del usuario en sesión: uno ajeno o
 * revocado responde igual que inexistente. Con la descarga apagada en el curso,
 * tampoco sale por URL directa.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireAuth(request, context);

	const input = parseInput(() =>
		validateDownloadCertificate({
			documentId: params.documentId,
			format: new URL(request.url).searchParams.get("formato"),
		}),
	);
	if (!input.success) {
		throw toRouteError(input.error, CERTIFICATE_ERROR_MESSAGES);
	}

	const result = await context.certificateService.downloadMine(
		input.data,
		auth,
	);
	if (!result.success) {
		throw toRouteError(result.error, CERTIFICATE_ERROR_MESSAGES);
	}

	return toDownloadResponse(result.data);
};
