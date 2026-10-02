import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { ownershipForNew } from "../../domain/certificate-template.access";
import { CERTIFICATE_ERROR_MESSAGES } from "../../utils/certificate-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/plantillas-de-certificado — la biblioteca. La ve quien
 * administra cursos; cada quien, las institucionales y las de su dependencia.
 * Las archivadas solo aparecen a quien las puede restaurar. Plantillas y
 * logos no dependen entre sí: van en una sola fase.
 */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { auth } = await requireCourseScope(request, context);

	const [templates, logos] = await Promise.all([
		context.certificateTemplateService.list(auth, { includeArchived: true }),
		context.certificateLogoService.listForEditor(),
	]);
	if (!templates.success) {
		throw toRouteError(templates.error, CERTIFICATE_ERROR_MESSAGES);
	}
	if (!logos.success)
		throw toRouteError(logos.error, CERTIFICATE_ERROR_MESSAGES);

	return ok({
		templates: templates.data,
		logoUrls: Object.fromEntries(
			logos.data
				.filter((logo) => !logo.builtin)
				.map((logo) => [logo.id, logo.url]),
		),
		canCreate: ownershipForNew(auth) !== null,
		today: context.clock.now(),
	});
};
