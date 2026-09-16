import { zonedYearOf } from "@/lib/date-utils";
import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import {
	CREDIT_LIST_DEFAULTS,
	CREDIT_MANAGER_ROLES,
} from "../../domain/credit.config";
import { validateCreditsOverviewQuery } from "../../domain/credit.validators";
import { CREDIT_ERROR_MESSAGES } from "../../utils/credit-error-messages";
import { CREDIT_PARAMS, readPositiveInt } from "../../utils/credit-params";
import type { Route } from "./+types/index";

/** GET /dashboard/creditos — personal de la dependencia o resumen por dependencia. */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { auth, scope } = await requireScope(
		request,
		context,
		CREDIT_MANAGER_ROLES,
	);
	const { searchParams } = new URL(request.url);

	const input = parseInput(() =>
		validateCreditsOverviewQuery({
			page:
				readPositiveInt(searchParams.get("page")) ?? CREDIT_LIST_DEFAULTS.page,
			pageSize:
				readPositiveInt(searchParams.get("pageSize")) ??
				CREDIT_LIST_DEFAULTS.pageSize,
			search: searchParams.get("search") || undefined,
			fiscalYear: readPositiveInt(searchParams.get(CREDIT_PARAMS.fiscalYear)),
			// Fuera del alcance global ni se lee: pedir otra dependencia no amplía nada.
			dependency:
				scope.kind === "global"
					? searchParams.get(CREDIT_PARAMS.dependency) || undefined
					: undefined,
		}),
	);
	if (!input.success) throw toRouteError(input.error, CREDIT_ERROR_MESSAGES);

	const result = await context.creditService.listOverview(input.data, auth);
	if (!result.success) throw toRouteError(result.error, CREDIT_ERROR_MESSAGES);

	return ok(
		{
			overview: result.data,
			currentYear: zonedYearOf(context.clock.now()),
			search: input.data.search ?? "",
		},
		{ pagination: result.pagination },
	);
};
