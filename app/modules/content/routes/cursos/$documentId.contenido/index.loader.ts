import { canEdit } from "@/modules/courses/domain/course.rules";
import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { COURSE_ERROR_MESSAGES } from "@/modules/courses/utils/course-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindContentCourse } from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId/contenido — el temario del curso.
 *
 * Es la puerta del curso ya publicado: el borrador lo edita desde su paso del
 * alta, con el mismo panel. Fuera de alcance responde 404 igual que inexistente.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth, scope } = await requireCourseScope(request, context);

	const { documentId } = validateFindContentCourse({
		documentId: params.documentId,
	});

	const [course, tree] = await Promise.all([
		context.courseService.findById(documentId, scope),
		context.contentService.findTree(documentId, auth),
	]);

	if (!course.success) throw toRouteError(course.error, COURSE_ERROR_MESSAGES);
	if (!tree.success) throw toRouteError(tree.error, CONTENT_ERROR_MESSAGES);

	return ok({
		course: course.data,
		tree: tree.data,
		canWrite: canEdit(course.data.status),
	});
};
