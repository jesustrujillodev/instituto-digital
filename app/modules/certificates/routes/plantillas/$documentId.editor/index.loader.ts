import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateTemplateTarget } from "../../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/plantillas-de-certificado/:documentId/editor. Quien la ve pero
 * no la administra la abre de solo lectura.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth } = await requireCourseScope(request, context);
	const { documentId } = validateTemplateTarget({
		documentId: params.documentId,
	});

	const [template, logos] = await Promise.all([
		context.certificateTemplateService.get(documentId, auth),
		context.certificateLogoService.listForEditor(),
	]);
	if (!template.success) {
		throw toRouteError(template.error, CERTIFICATE_ERROR_MESSAGES);
	}
	if (!logos.success)
		throw toRouteError(logos.error, CERTIFICATE_ERROR_MESSAGES);

	return ok({
		template: template.data,
		logos: logos.data,
		today: context.clock.now(),
	});
};
