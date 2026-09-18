import { redirect } from "react-router";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canEdit } from "../../../domain/course.rules";
import { validateFindCourse } from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId/editar — formulario de edición.
 *
 * Un curso finalizado o cancelado ya no se edita: la URL lleva a su ficha en
 * vez de pintar un formulario que no se puede guardar.
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

	if (!canEdit(course.data.status)) {
		throw redirect(`/dashboard/cursos/${documentId}`);
	}

	return ok({ course: course.data, options: options.data });
};
