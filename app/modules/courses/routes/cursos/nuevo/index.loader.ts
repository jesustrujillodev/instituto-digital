import { validateFindPlan } from "@/modules/annual-plan/domain/annual-plan.validators";
import { ANNUAL_PLAN_ERROR_MESSAGES } from "@/modules/annual-plan/utils/annual-plan-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { COURSE_ERROR_MESSAGES } from "../../../utils/course-error-messages";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/** Parámetro con la línea del plan desde la que se crea el curso. */
export const PLAN_LINE_PARAM = "linea";

/**
 * GET /dashboard/capacitaciones/nuevo — opciones de los selectores del alta y, con
 * `?linea=`, el título y la modalidad de la línea del plan (§6.11).
 */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { auth, scope } = await requireCourseScope(request, context);
	const lineParam = new URL(request.url).searchParams.get(PLAN_LINE_PARAM);

	if (!lineParam) {
		const options = await context.courseService.listFormOptions(scope);
		if (!options.success)
			throw toRouteError(options.error, COURSE_ERROR_MESSAGES);

		return ok({ options: options.data, prefill: null });
	}

	const line = parseInput(() => validateFindPlan({ documentId: lineParam }));
	if (!line.success) throw toRouteError(line.error, ANNUAL_PLAN_ERROR_MESSAGES);

	const [options, prefill] = await Promise.all([
		context.courseService.listFormOptions(scope),
		context.annualPlanService.findLineForCourse(line.data.documentId, auth),
	]);
	if (!options.success)
		throw toRouteError(options.error, COURSE_ERROR_MESSAGES);
	if (!prefill.success) {
		throw toRouteError(prefill.error, ANNUAL_PLAN_ERROR_MESSAGES);
	}

	return ok({ options: options.data, prefill: prefill.data });
};
