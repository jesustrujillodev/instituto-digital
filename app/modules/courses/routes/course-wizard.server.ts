import { redirect } from "react-router";
import { FINAL_QUIZ_OWNER } from "@/modules/content/domain/quiz.rules";
import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import type { ICradle } from "@/shared/di/container.types";
import { toRouteError } from "@/shared/http/route-error";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	canEdit,
	publishChecklist,
	requiresContent,
	requiresSessions,
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
	type CourseUpdateActionData,
	parseCourseFormData,
} from "../utils/parse-course-form-data";
import { runStatusIntent } from "./course-status-intents.server";
import { requireCourseParam } from "./require-course-param";
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

	const documentId = requireCourseParam(params.documentId);
	const { search } = new URL(request.url);

	const step = parseStepNumber(params.paso);
	if (!step) throw redirect(`${stepPath(documentId, 1, mode)}${search}`);

	const course = await context.courseService.findById(documentId, scope);
	if (!course.success) throw toRouteError(course.error, COURSE_ERROR_MESSAGES);

	const { status } = course.data;
	if (!canEdit(status))
		throw redirect(`/dashboard/capacitaciones/${documentId}`);

	const expected: CourseWizardMode = status === "DRAFT" ? "create" : "edit";
	if (expected !== mode) {
		throw redirect(`${stepPath(documentId, 1, expected)}${search}`);
	}

	// Las opciones de los selectores solo las pintan General, Programa e
	// Inscripción; el temario completo, Contenido, Evaluación y Revisión; los
	// bancos, solo Evaluación; el seguimiento, Evaluación y Revisión. Los conteos
	// del pendiente de publicación se leen siempre: son unos cuantos `count`.
	const readsOptions =
		step.key === "identity" || step.key === "program" || step.key === "access";
	const readsTree =
		requiresContent(course.data) &&
		(step.key === "content" || step.key === "rules" || step.key === "review");
	const readsBank = step.key === "rules";
	const readsFollowUps =
		requiresSessions(course.data.format) &&
		(step.key === "rules" || step.key === "review");

	// Todo depende solo del curso: va en paralelo. Los planes que se ofrecen son
	// los de su organizadora.
	const [options, tree, quiz, facts, followUps, followUpBanks] =
		await Promise.all([
			readsOptions
				? context.courseService.listFormOptions(scope, course.data)
				: null,
			readsTree ? context.contentService.findTree(documentId, auth) : null,
			readsBank
				? context.quizService.findBank(documentId, FINAL_QUIZ_OWNER, auth)
				: null,
			context.courseService.findContentFacts(course.data),
			readsFollowUps
				? context.quizService.findFollowUps(documentId, auth)
				: null,
			readsFollowUps && readsBank
				? context.quizService.findFollowUpBanks(documentId, auth)
				: null,
		]);

	if (options && !options.success)
		throw toRouteError(options.error, COURSE_ERROR_MESSAGES);
	if (tree && !tree.success)
		throw toRouteError(tree.error, CONTENT_ERROR_MESSAGES);
	if (quiz && !quiz.success)
		throw toRouteError(quiz.error, CONTENT_ERROR_MESSAGES);
	if (!facts.success) throw toRouteError(facts.error, COURSE_ERROR_MESSAGES);
	if (followUps && !followUps.success) {
		throw toRouteError(followUps.error, CONTENT_ERROR_MESSAGES);
	}
	if (followUpBanks && !followUpBanks.success) {
		throw toRouteError(followUpBanks.error, CONTENT_ERROR_MESSAGES);
	}

	const content = tree?.data ?? null;
	const bank = quiz?.data ?? null;
	const quizQuestionCount = facts.data.finalQuizQuestionCount;
	const checklist = publishChecklist(course.data, facts.data);

	// Un paso que este curso no recorre no tiene pantalla: el alta manda a lo
	// que de verdad falta y la edición, al principio.
	if (!stepsFor(course.data, mode).some((entry) => entry.key === step.key)) {
		const target =
			mode === "create" ? firstPendingStep(checklist, course.data) : 1;
		throw redirect(`${stepPath(documentId, target, mode)}${search}`);
	}

	return ok({
		course: course.data,
		options: options?.data ?? null,
		stepNumber: step.number,
		checklist: mode === "create" ? checklist : null,
		content,
		followUps: followUps?.data ?? [],
		followUpBanks: followUpBanks?.data ?? {},
		quiz: bank,
		quizQuestionCount,
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
}: WizardArgs): Promise<CourseActionData | CourseUpdateActionData> => {
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

	// Las sesiones recién creadas ya tienen identidad: con ella el alta cuelga el
	// material que les agregó antes de guardar (docs/adr/0026).
	return ok(
		{
			sessions: result.data.sessions.map(({ documentId, startsAt }) => ({
				documentId,
				startsAt,
			})),
		},
		{ message: "Cambios guardados" },
	);
};
