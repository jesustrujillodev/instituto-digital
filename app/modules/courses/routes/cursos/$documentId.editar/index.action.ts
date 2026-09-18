import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import {
	validateFindCourse,
	validateUpdateCourse,
} from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import {
	type CourseActionData,
	parseCourseFormData,
} from "../../../utils/parse-course-form-data";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/cursos/:documentId/editar — guardar.
 *
 * Publicar y cancelar viven en la ficha: publicar desde aquí usaría lo último
 * guardado y no lo que está en pantalla.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<CourseActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const { payload, cover } = parseCourseFormData(await request.formData());

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
