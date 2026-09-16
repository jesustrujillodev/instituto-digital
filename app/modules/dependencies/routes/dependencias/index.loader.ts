import { requireRole } from "@/shared/auth/require-role.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { DEPENDENCY_ADMIN_ROLES } from "../../domain/dependency.access";
import { DEPENDENCY_LIST_DEFAULTS } from "../../domain/dependency.config";
import { validateListDependencies } from "../../domain/dependency.validators";
import { DEPENDENCY_ERROR_MESSAGES } from "../../utils/dependency-error-messages";
import type { Route } from "./+types/index";

/** Entero positivo del query string, o `undefined` si no viene o es basura. */
const readNumber = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Solo SUPERADMIN — un titular que abra esta URL recibe un 403 real (no un
	// redirect): aquí el recurso existe y lo que falta es permiso.
	const auth = await requireRole(request, context, DEPENDENCY_ADMIN_ROLES);

	const { searchParams } = new URL(request.url);

	// Los filtros viven en la URL y no en estado local: así la vista es
	// enlazable, sobrevive a un refresh y el botón "atrás" hace lo esperado.
	const filters = validateListDependencies({
		page: readNumber(searchParams.get("page")) ?? DEPENDENCY_LIST_DEFAULTS.page,
		pageSize:
			readNumber(searchParams.get("pageSize")) ??
			DEPENDENCY_LIST_DEFAULTS.pageSize,
		search: searchParams.get("search") || undefined,
		status: searchParams.get("status") || undefined,
		// El orden también es del servidor: con paginación, ordenar en el cliente
		// solo reordenaría la página visible y mentiría sobre el conjunto.
		sortBy: searchParams.get("sortBy") || undefined,
		sortDir: searchParams.get("sortDir") || undefined,
	});

	const result = await context.dependencyService.list(filters);

	// Un loader que falla no tiene pantalla que mostrar: corta con el status del
	// código y deja el error al ErrorBoundary.
	if (!result.success) {
		throw toRouteError(result.error, DEPENDENCY_ERROR_MESSAGES);
	}

	return ok(
		{
			auth,
			dependencies: result.data,
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
