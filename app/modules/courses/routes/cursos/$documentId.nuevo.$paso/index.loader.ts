import { redirect } from "react-router";
import { toContentSummary } from "@/modules/content/domain/content.mapper";
import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	canEdit,
	publishChecklist,
	requiresContent,
} from "../../../domain/course.rules";
import { validateFindCourse } from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import {
	firstPendingStep,
	parseStepNumber,
	stepPath,
	stepsFor,
} from "../../../utils/course-wizard-steps";
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
	const { auth, scope } = await requireCourseScope(request, context);

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

	// El temario se lee una sola vez: alimenta el paso Contenido y el pendiente
	// de publicación que la revisión enseña.
	const tree = requiresContent(course.data)
		? await context.contentService.findTree(documentId, auth)
		: null;
	if (tree && !tree.success)
		throw toRouteError(tree.error, CONTENT_ERROR_MESSAGES);

	const content = tree?.data ?? null;
	const checklist = publishChecklist(course.data, {
		lessonCount: content ? toContentSummary(content).lessonCount : 0,
	});

	// Un paso que este formato no recorre no tiene pantalla: se manda a lo que
	// de verdad falta.
	if (!stepsFor(course.data).some((entry) => entry.key === step.key)) {
		throw redirect(
			stepPath(documentId, firstPendingStep(checklist, course.data)),
		);
	}

	return ok({
		course: course.data,
		options: options.data,
		stepNumber: step.number,
		checklist,
		content,
	});
};
