import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canManageGroups, GROUP_ACCESS_ROLES } from "../../domain/group.access";
import { GROUP_LIST_DEFAULTS } from "../../domain/group.config";
import { validateListGroups } from "../../domain/group.validators";
import { GROUP_ERROR_MESSAGES } from "../../utils/group-error-messages";
import type { Route } from "./+types/index";

/** Entero positivo del query string, o `undefined` si no viene o es basura. */
const readNumber = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 `requireScope` resuelve rol y alcance de una vez: no se puede acertar el
	// rol y olvidar el alcance.
	const { auth, scope } = await requireScope(
		request,
		context,
		GROUP_ACCESS_ROLES,
	);

	const { searchParams } = new URL(request.url);

	const filters = validateListGroups({
		page: readNumber(searchParams.get("page")) ?? GROUP_LIST_DEFAULTS.page,
		pageSize:
			readNumber(searchParams.get("pageSize")) ?? GROUP_LIST_DEFAULTS.pageSize,
		search: searchParams.get("search") || undefined,
		status: searchParams.get("status") || undefined,
		sortBy: searchParams.get("sortBy") || undefined,
		sortDir: searchParams.get("sortDir") || undefined,
	});

	const result = await context.groupService.list(filters, scope);

	if (!result.success) {
		throw toRouteError(result.error, GROUP_ERROR_MESSAGES);
	}

	return ok(
		{
			auth,
			groups: result.data,
			// El superadministrador consulta los grupos de todas las dependencias y
			// no los administra: la matriz de §3 no le da esa columna.
			canManage: canManageGroups(scope),
			filters: {
				search: filters.search ?? "",
				status: filters.status ?? "active",
				sortBy: filters.sortBy ?? "name",
				sortDir: filters.sortDir ?? "asc",
			},
		},
		{ pagination: result.pagination },
	);
};
