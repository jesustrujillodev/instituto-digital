import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { parseInput } from "@/shared/response/response.helpers";
import { validateDownloadSample } from "../../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import { toDownloadResponse } from "../../download-response";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId/certificado/muestra?version=draft|published&formato=pdf|png
 *
 * El certificado guardado con datos de muestra, para revisarlo antes de emitir.
 * Lo baja quien lo diseña; lo que no se guardó no se exporta.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth } = await requireCourseScope(request, context);

	const query = new URL(request.url).searchParams;
	const input = parseInput(() =>
		validateDownloadSample({
			documentId: params.documentId,
			version: query.get("version"),
			format: query.get("formato"),
		}),
	);
	if (!input.success) {
		throw toRouteError(input.error, CERTIFICATE_ERROR_MESSAGES);
	}

	const result = await context.certificateService.downloadSample(
		input.data,
		auth,
	);
	if (!result.success) {
		throw toRouteError(result.error, CERTIFICATE_ERROR_MESSAGES);
	}

	return toDownloadResponse(result.data);
};
