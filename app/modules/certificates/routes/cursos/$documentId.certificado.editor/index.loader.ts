import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canEditCertificate } from "../../../domain/certificate.rules";
import { validateCertificateCourse } from "../../../domain/certificate.validators";
import { ownershipForNew } from "../../../domain/certificate-template.access";
import { toEditableDesign } from "../../../domain/design/design.presets";
import { isDesignV2 } from "../../../domain/design/design.schema";
import { CERTIFICATE_ERROR_MESSAGES } from "../../../utils/certificate-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/capacitaciones/:documentId/certificado/editor — el editor libre.
 *
 * Mismo alcance que la ficha del certificado. El certificado, los logos y la
 * biblioteca no dependen entre sí: se leen en una sola fase.
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

	const [editor, logos, templates] = await Promise.all([
		context.certificateService.getEditor(documentId, auth),
		context.certificateLogoService.listForEditor(),
		context.certificateTemplateService.list(auth, { includeArchived: false }),
	]);
	if (!editor.success) {
		throw toRouteError(editor.error, CERTIFICATE_ERROR_MESSAGES);
	}
	if (!logos.success) {
		throw toRouteError(logos.error, CERTIFICATE_ERROR_MESSAGES);
	}
	if (!templates.success) {
		throw toRouteError(templates.error, CERTIFICATE_ERROR_MESSAGES);
	}

	const { draft } = editor.data.record;
	return ok({
		editor: editor.data,
		logos: logos.data,
		templates: templates.data,
		canCreateTemplates: ownershipForNew(auth) !== null,
		design: toEditableDesign(draft),
		/** El borrador era del gestor anterior: se abre convertido, sin guardar. */
		migrated: !isDesignV2(draft),
		canEdit: canEditCertificate(editor.data.course.status),
		// La fecha de muestra sale del servidor para no romper la hidratación.
		today: context.clock.now(),
	});
};
