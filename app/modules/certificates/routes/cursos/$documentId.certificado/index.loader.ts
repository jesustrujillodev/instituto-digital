import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canEditCertificate } from "../../../domain/certificate.rules";
import { validateCertificateCourse } from "../../../domain/certificate.validators";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/capacitaciones/:documentId/certificado — la ficha del
 * certificado: vista previa, estado, publicación, muestras y entrega.
 *
 * Lo abre quien administra el curso, igual que su ficha: sin alcance de cursos
 * responde 403, y un curso fuera de alcance 404, igual que inexistente. Los
 * logos van en la misma fase: la vista previa los necesita y no dependen del
 * certificado.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth } = await requireCourseScope(request, context);

	const { documentId } = validateCertificateCourse({
		documentId: params.documentId,
	});

	const [result, logos] = await Promise.all([
		context.certificateService.getEditor(documentId, auth),
		context.certificateLogoService.listForEditor(),
	]);
	if (!result.success) {
		throw toRouteError(result.error, CERTIFICATE_ERROR_MESSAGES);
	}
	if (!logos.success) {
		throw toRouteError(logos.error, CERTIFICATE_ERROR_MESSAGES);
	}

	return ok({
		editor: result.data,
		logoUrls: Object.fromEntries(
			logos.data
				.filter((logo) => !logo.builtin)
				.map((logo) => [logo.id, logo.url]),
		),
		canEdit: canEditCertificate(result.data.course.status),
		// La fecha de muestra sale del servidor: calcularla en el navegador
		// podría dar otro día que el HTML ya pintado y romper la hidratación.
		today: context.clock.now(),
	});
};
