import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
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

/** POST /dashboard/cursos/:documentId/editar — guardar, publicar o cancelar. */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<CourseActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const { intent, payload } = parseCourseFormData(await request.formData());

	if (intent !== COURSE_INTENTS.update) {
		return runStatusIntent(intent, params.documentId, auth, context);
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
	);
	if (!result.success) return localizeError(result, COURSE_ERROR_MESSAGES);

	return ok(null, { message: "Cambios guardados" });
};
