import { redirect } from "react-router";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canEdit, publishChecklist } from "../../../domain/course.rules";
import { validateFindCourse } from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import { parseStepNumber, stepPath } from "../../../utils/course-wizard-steps";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId/nuevo/:paso — un paso del alta.
 *
 * El alta solo sirve borradores: un curso publicado, finalizado o cancelado se
 * corrige desde su formulario de edición, donde se va al campo concreto en vez
 * de recorrer pasos.
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

	const { documentId } = validateFindCourse({ documentId: params.documentId });

	const step = parseStepNumber(params.paso);
	if (!step) throw redirect(stepPath(documentId, 1));

	const [course, options] = await Promise.all([
		context.courseService.findById(documentId, scope),
		context.courseService.listFormOptions(scope),
	]);

	if (!course.success) throw toRouteError(course.error, COURSE_ERROR_MESSAGES);
	if (!options.success)
		throw toRouteError(options.error, COURSE_ERROR_MESSAGES);

	const { status } = course.data;
	if (status !== "DRAFT") {
		const base = `/dashboard/cursos/${documentId}`;
		throw redirect(canEdit(status) ? `${base}/editar` : base);
	}

	return ok({
		course: course.data,
		options: options.data,
		stepNumber: step.number,
		checklist: publishChecklist(course.data),
	});
};
