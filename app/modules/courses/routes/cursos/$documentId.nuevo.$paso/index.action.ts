import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateFindCourse,
	validateUpdateCourse,
} from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import {
	COURSE_INTENTS,
	type CourseActionData,
	parseCourseFormData,
} from "../../../utils/parse-course-form-data";
import { runStatusIntent } from "../../course-status-intents.server";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/cursos/:documentId/nuevo/:paso — guardar el paso o publicar.
 *
 * Cada paso manda el curso ENTERO: el formulario lo trae completo del loader y
 * solo valida en pantalla los campos del paso. La regla de actualización admite
 * sesiones y capacitadores vacíos, así que un paso intermedio guarda sin exigir
 * lo que todavía no se captura; lo duro sigue siendo de `publish`.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<CourseActionData> => {
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

	return ok(null, { message: "Paso guardado" });
};
