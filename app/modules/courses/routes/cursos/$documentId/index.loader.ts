import { canEditCertificate } from "@/modules/certificates/domain/certificate.rules";
import { FINAL_QUIZ_OWNER } from "@/modules/content/domain/quiz.rules";
import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import { ENROLLMENT_ERROR_MESSAGES } from "@/modules/enrollments/utils/enrollment-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canOpenTeaching } from "../../../domain/course.access";
import {
	canCancel,
	canEdit,
	canPublish,
	evaluatesByQuiz,
	publishChecklist,
	requiresContent,
} from "../../../domain/course.rules";
import { validateFindCourse } from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import { toEnrollmentSummary } from "../../../utils/to-enrollment-summary";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/cursos/:documentId — ficha del curso.
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

	const [course, roster] = await Promise.all([
		context.courseService.findById(documentId, scope),
		context.enrollmentService.listRoster(documentId, auth),
	]);

	if (!course.success) throw toRouteError(course.error, COURSE_ERROR_MESSAGES);
	if (!roster.success)
		throw toRouteError(roster.error, ENROLLMENT_ERROR_MESSAGES);

	const { status } = course.data;

	// El temario solo se consulta cuando el curso lo pide: uno que se completa
	// solo por asistencia no mira sus lecciones.
	const content = requiresContent(course.data)
		? await context.contentService.summarize(documentId, auth)
		: null;
	if (content && !content.success)
		throw toRouteError(content.error, CONTENT_ERROR_MESSAGES);

	const quiz = evaluatesByQuiz(course.data)
		? await context.quizService.findBank(documentId, FINAL_QUIZ_OWNER, auth)
		: null;
	if (quiz && !quiz.success)
		throw toRouteError(quiz.error, CONTENT_ERROR_MESSAGES);

	const facts = {
		lessonCount: content?.data.lessonCount ?? 0,
		finalQuizQuestionCount: quiz?.success
			? (quiz.data?.questions.length ?? 0)
			: 0,
	};

	return ok({
		course: course.data,
		coverUrl: roster.data.course.coverUrl,
		enrollment: toEnrollmentSummary(roster.data),
		publishChecklist: canPublish(status)
			? publishChecklist(course.data, facts)
			: null,
		can: {
			edit: canEdit(status),
			certificate: canEditCertificate(status),
			publish: canPublish(status),
			cancel: canCancel(status),
			teach: canOpenTeaching(scope, course.data, auth.documentId),
		},
	});
};
