import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { validateCreateCourse } from "../../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import {
	type CourseActionData,
	parseCourseFormData,
} from "../../../utils/parse-course-form-data";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/** POST /dashboard/cursos/nuevo — alta en borrador. */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<CourseActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const { payload, cover } = parseCourseFormData(await request.formData());

	const input = parseInput(() => validateCreateCourse(payload));
	if (!input.success) return localizeError(input, COURSE_ERROR_MESSAGES);

	// La organizadora solo se toma del formulario para el alcance global; el
	// servicio la ignora para los demás.
	const created = await context.courseService.create(input.data, auth, cover);
	if (!created.success) return localizeError(created, COURSE_ERROR_MESSAGES);

	return ok(null, { message: "Curso creado en borrador" });
};
