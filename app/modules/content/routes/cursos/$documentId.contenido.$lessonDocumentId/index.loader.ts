import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	validateFindContentCourse,
	validateFindMaterial,
} from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId/contenido/:lessonDocumentId
 *
 * El material de una sola lección. Vive aparte del temario porque el árbol se
 * carga entero en cada pantalla y el cuerpo de cada lección no tiene por qué
 * viajar con él.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth } = await requireCourseScope(request, context);

	const { documentId } = validateFindContentCourse({
		documentId: params.documentId,
	});
	const { lessonDocumentId } = validateFindMaterial({
		lessonDocumentId: params.lessonDocumentId,
	});

	const material = await context.contentService.findMaterial(
		documentId,
		lessonDocumentId,
		auth,
	);

	if (!material.success) {
		throw toRouteError(material.error, CONTENT_ERROR_MESSAGES);
	}

	return ok(material.data);
};
