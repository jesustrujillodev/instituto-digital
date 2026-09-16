import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/** GET /dashboard/cursos/nuevo — opciones de los selectores del alta. */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { scope } = await requireCourseScope(request, context);

	const options = await context.courseService.listFormOptions(scope);
	if (!options.success)
		throw toRouteError(options.error, COURSE_ERROR_MESSAGES);

	return ok({ options: options.data });
};
