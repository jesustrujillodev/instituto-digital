import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canCancel, canEdit, canPublish } from "../../../domain/course.rules";
import { validateFindCourse } from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId/editar — ficha del curso.
 *
 * Fuera de alcance responde 404 igual que inexistente: un capacitador no
 * confirma por URL que exista un curso que no creó.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { scope } = await requireCourseScope(request, context);

	// La validación de frontera también aplica al parámetro de la URL.
	const { documentId } = validateFindCourse({ documentId: params.documentId });

	const [course, options] = await Promise.all([
		context.courseService.findById(documentId, scope),
		context.courseService.listFormOptions(scope),
	]);

	if (!course.success) throw toRouteError(course.error, COURSE_ERROR_MESSAGES);
	if (!options.success)
		throw toRouteError(options.error, COURSE_ERROR_MESSAGES);

	const { status } = course.data;

	return ok({
		course: course.data,
		options: options.data,
		canEdit: canEdit(status),
		canPublish: canPublish(status),
		canCancel: canCancel(status),
	});
};
