import { requireTeaching } from "@/modules/teaching/routes/require-teaching.server";
import { toRouteError } from "@/shared/http/route-error";
import { parseInput } from "@/shared/response/response.helpers";
import { validateDownloadCertificate } from "../../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import { toDownloadResponse } from "../../download-response";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/certificados/:documentId/descargar?formato=pdf|png
 *
 * Ruta de recurso: responde el archivo. Lo baja quien ve el curso en
 * impartición. La petición solo aporta el identificador y el formato: el diseño
 * y los datos salen de lo congelado al emitir, nunca del navegador.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireTeaching(request, context);

	const input = parseInput(() =>
		validateDownloadCertificate({
			documentId: params.documentId,
			format: new URL(request.url).searchParams.get("formato"),
		}),
	);
	if (!input.success) {
		throw toRouteError(input.error, CERTIFICATE_ERROR_MESSAGES);
	}

	const result = await context.certificateService.downloadIssue(
		input.data,
		auth,
	);
	if (!result.success) {
		throw toRouteError(result.error, CERTIFICATE_ERROR_MESSAGES);
	}

	return toDownloadResponse(result.data);
};
