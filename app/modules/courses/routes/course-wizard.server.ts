import { redirect } from "react-router";
import { toContentSummary } from "@/modules/content/domain/content.mapper";
import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import { EVALUATION_ERROR_MESSAGES } from "@/modules/evaluations/utils/evaluation-error-messages";
import type { ICradle } from "@/shared/di/container.types";
import { toRouteError } from "@/shared/http/route-error";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	canEdit,
	evaluatesByQuiz,
	publishChecklist,
	requiresContent,
} from "../domain/course.rules";
import {
	validateFindCourse,
	validateUpdateCourse,
} from "../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../utils/course-error-messages";
import {
	type CourseWizardMode,
	firstPendingStep,
	parseStepNumber,
	stepPath,
	stepsFor,
} from "../utils/course-wizard-steps";
import {
	COURSE_INTENTS,
	type CourseActionData,
	parseCourseFormData,
} from "../utils/parse-course-form-data";
import { runStatusIntent } from "./course-status-intents.server";
import { requireCourseScope } from "./require-course-scope.server";

interface WizardArgs {
	request: Request;
	context: ICradle;
	params: { documentId?: string; paso?: string };
}

/**
 * Un paso del alta (`/nuevo/:paso`) o de la edición (`/editar/:paso`).
 *
 * El estado del curso decide cuál de las dos toca: un borrador se da de alta y
 * un publicado se edita. La URL equivocada lleva a la correcta, y un curso
 * finalizado o cancelado ya no se toca: se va a su ficha.
 *
 * Fuera de alcance responde 404 igual que inexistente: un capacitador no
 * confirma por URL que exista un curso que no creó.
 */
export const loadCourseWizard = async (
	{ request, context, params }: WizardArgs,
	mode: CourseWizardMode,
) => {
	const { auth, scope } = await requireCourseScope(request, context);

	const { documentId } = validateFindCourse({ documentId: params.documentId });
	const { search } = new URL(request.url);

	const step = parseStepNumber(params.paso);
	if (!step) throw redirect(`${stepPath(documentId, 1, mode)}${search}`);

	const [course, options] = await Promise.all([
		context.courseService.findById(documentId, scope),
		context.courseService.listFormOptions(scope),
	]);

	if (!course.success) throw toRouteError(course.error, COURSE_ERROR_MESSAGES);
	if (!options.success)
		throw toRouteError(options.error, COURSE_ERROR_MESSAGES);

	const { status } = course.data;
	if (!canEdit(status)) throw redirect(`/dashboard/cursos/${documentId}`);

	const expected: CourseWizardMode = status === "DRAFT" ? "create" : "edit";
	if (expected !== mode) {
		throw redirect(`${stepPath(documentId, 1, expected)}${search}`);
	}

	// El temario se lee una sola vez: alimenta el paso Contenido y el pendiente
	// de publicación que la revisión enseña.
	const tree = requiresContent(course.data)
		? await context.contentService.findTree(documentId, auth)
		: null;
	if (tree && !tree.success)
		throw toRouteError(tree.error, CONTENT_ERROR_MESSAGES);

	const content = tree?.data ?? null;

	// El examen se arma en el paso de Evaluación y su conteo alimenta el
	// pendiente de publicación, así que se lee en los dos casos.
	const quiz =
		step.key === "rules" || evaluatesByQuiz(course.data)
			? await context.quizService.findBank(documentId, null, auth)
			: null;
	if (quiz && !quiz.success)
		throw toRouteError(quiz.error, CONTENT_ERROR_MESSAGES);
	const bank = quiz?.success ? quiz.data : null;

	const checklist = publishChecklist(course.data, {
		lessonCount: content ? toContentSummary(content).lessonCount : 0,
		finalQuizQuestionCount: bank?.questions.length ?? 0,
	});

	// Un paso que este curso no recorre no tiene pantalla: el alta manda a lo
	// que de verdad falta y la edición, al principio.
	if (!stepsFor(course.data, mode).some((entry) => entry.key === step.key)) {
		const target =
			mode === "create" ? firstPendingStep(checklist, course.data) : 1;
		throw redirect(`${stepPath(documentId, target, mode)}${search}`);
	}

	const evaluations =
		step.key === "rules" || step.key === "review"
			? await context.evaluationService.findDefinitions(documentId, auth)
			: null;
	if (evaluations && !evaluations.success) {
		throw toRouteError(evaluations.error, EVALUATION_ERROR_MESSAGES);
	}

	return ok({
		course: course.data,
		options: options.data,
		stepNumber: step.number,
		checklist: mode === "create" ? checklist : null,
		content,
		evaluations: evaluations?.success ? evaluations.data : [],
		quiz: bank,
	});
};

/**
 * Guardar un paso, o publicar desde la revisión del alta.
 *
 * Cada paso manda el curso ENTERO: el formulario lo trae completo del loader y
 * solo valida en pantalla los campos del paso. La regla de actualización admite
 * sesiones y capacitadores vacíos, así que un paso intermedio guarda sin exigir
 * lo que todavía no se captura; lo duro sigue siendo de `publish`.
 */
export const saveCourseStep = async ({
	request,
	context,
	params,
}: WizardArgs): Promise<CourseActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const { intent, payload, cover } = parseCourseFormData(
		await request.formData(),
	);

	if (intent === COURSE_INTENTS.publish) {
		return runStatusIntent(intent, params.documentId, auth, context);
	}

	if (intent !== COURSE_INTENTS.update) {
		return fail({
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Acción no reconocida.",
		});
	}

	const input = parseInput(() => ({
		documentId: validateFindCourse({ documentId: params.documentId })
			.documentId,
		dto: validateUpdateCourse(payload),
	}));
	if (!input.success) return localizeError(input, COURSE_ERROR_MESSAGES);

	const result = await context.courseService.update(
		input.data.documentId,
		input.data.dto,
		auth,
		cover,
	);
	if (!result.success) return localizeError(result, COURSE_ERROR_MESSAGES);

	return ok(null, { message: "Cambios guardados" });
};
