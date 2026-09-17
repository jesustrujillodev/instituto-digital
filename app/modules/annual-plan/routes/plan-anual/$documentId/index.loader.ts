import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { PLAN_ACCESS_ROLES } from "../../../domain/annual-plan.access";
import { validateFindPlan } from "../../../domain/annual-plan.validators";
import { ANNUAL_PLAN_ERROR_MESSAGES } from "../../../utils/annual-plan-error-messages";
import type { Route } from "./+types/index";

/** GET /dashboard/plan-anual/:documentId */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth } = await requireScope(request, context, PLAN_ACCESS_ROLES);

	const input = parseInput(() => validateFindPlan(params));
	if (!input.success) {
		throw toRouteError(input.error, ANNUAL_PLAN_ERROR_MESSAGES);
	}

	const result = await context.annualPlanService.findPlan(
		input.data.documentId,
		auth,
	);
	if (!result.success) {
		throw toRouteError(result.error, ANNUAL_PLAN_ERROR_MESSAGES);
	}

	return ok(result.data);
};
