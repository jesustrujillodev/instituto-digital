import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { PLAN_ACCESS_ROLES } from "../../domain/annual-plan.access";
import { validateListPlans } from "../../domain/annual-plan.validators";
import { ANNUAL_PLAN_ERROR_MESSAGES } from "../../utils/annual-plan-error-messages";
import { DEPENDENCY_PARAM } from "../../utils/parse-plan-form-data";
import type { Route } from "./+types/index";

/** GET /dashboard/plan-anual — planes de la dependencia, o de todas para el alcance global. */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { auth, scope } = await requireScope(
		request,
		context,
		PLAN_ACCESS_ROLES,
	);
	const isGlobal = scope.kind === "global";
	const { searchParams } = new URL(request.url);

	const input = parseInput(() =>
		validateListPlans({
			dependency: isGlobal
				? searchParams.get(DEPENDENCY_PARAM) || undefined
				: undefined,
		}),
	);
	if (!input.success) {
		throw toRouteError(input.error, ANNUAL_PLAN_ERROR_MESSAGES);
	}

	const [result, dependencies] = await Promise.all([
		context.annualPlanService.listPlans(input.data, auth),
		isGlobal ? context.dependencyService.listCatalog() : Promise.resolve(null),
	]);
	if (!result.success) {
		throw toRouteError(result.error, ANNUAL_PLAN_ERROR_MESSAGES);
	}
	if (dependencies && !dependencies.success) {
		throw toRouteError(dependencies.error, ANNUAL_PLAN_ERROR_MESSAGES);
	}

	return ok({
		...result.data,
		canFilterByDependency: isGlobal,
		dependency: input.data.dependency ?? "",
		dependencies: dependencies?.success
			? dependencies.data.map(({ documentId, name }) => ({ documentId, name }))
			: [],
	});
};
