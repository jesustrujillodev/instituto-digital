import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { USER_MANAGER_ROLES } from "../../domain/user.access.rules";
import { USER_LIST_DEFAULTS } from "../../domain/user.config";
import { validateListUsers } from "../../domain/user.validators";
import { USER_ERROR_MESSAGES } from "../../utils/user-error-messages";
import type { Route } from "./+types/index";

/** Entero positivo del query string, o `undefined` si no viene o es basura. */
const readNumber = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Rol Y alcance en un solo acto: quien acierta el rol no puede olvidar
	// filtrar. Un rol insuficiente produce un 403 real (no un redirect), que pinta
	// dashboard.boundary.tsx conservando el shell.
	const { auth, scope } = await requireScope(
		request,
		context,
		USER_MANAGER_ROLES,
	);

	const { searchParams } = new URL(request.url);

	// Los filtros viven en la URL y no en estado local: así la vista es
	// enlazable, sobrevive a un refresh y el botón "atrás" hace lo esperado.
	const filters = validateListUsers({
		page: readNumber(searchParams.get("page")) ?? USER_LIST_DEFAULTS.page,
		pageSize:
			readNumber(searchParams.get("pageSize")) ?? USER_LIST_DEFAULTS.pageSize,
		search: searchParams.get("search") || undefined,
		role: searchParams.get("role") || undefined,
		// Filtro ADICIONAL al alcance, nunca una forma de ampliarlo: el alcance se
		// aplica igual, así que pedir otra dependencia no devuelve nada.
		dependency: searchParams.get("dependency") || undefined,
		type: searchParams.get("type") || undefined,
		status: searchParams.get("status") || undefined,
		// El orden también es del servidor: con paginación, ordenar en el cliente
		// solo reordenaría la página visible y mentiría sobre el conjunto.
		sortBy: searchParams.get("sortBy") || undefined,
		sortDir: searchParams.get("sortDir") || undefined,
	});

	// El catálogo de dependencias solo se pide con alcance global: es lo único que
	// habilita el filtro, y para un titular sería una lista de destinos que no
	// puede consultar.
	const isGlobal = scope.kind === "global";

	const [result, dependencies] = await Promise.all([
		context.userService.list(filters, scope),
		// Catálogo COMPLETO y no solo el de activas: la columna tiene que poder
		// nombrar la dependencia de alguien adscrito a una ya desactivada, y filtrar
		// por ella es justo cómo se encuentra a esa gente.
		isGlobal ? context.dependencyService.listCatalog() : Promise.resolve(null),
	]);

	// Un loader que falla no tiene pantalla que mostrar: corta con el status del
	// código y deja el error al ErrorBoundary. Un action, en cambio, devolvería
	// `{ success: false }` para que la pantalla siga en pie.
	if (!result.success) throw toRouteError(result.error, USER_ERROR_MESSAGES);

	// Se devuelve el envelope tal cual —incluida su `pagination`— y el estado de
	// vista viaja dentro de `data`: la pantalla lee siempre la misma forma,
	// venga de este loader o de cualquier otro.
	return ok(
		{
			auth,
			users: result.data,
			// La pantalla no vuelve a deducir el alcance: recibe si puede filtrar por
			// dependencia y con qué opciones. Una segunda deducción en el cliente
			// podría discrepar de la que aplicó el servidor.
			canFilterByDependency: isGlobal,
			dependencies: dependencies?.success ? dependencies.data : [],
			filters: {
				search: filters.search ?? "",
				role: filters.role ?? "",
				dependency: filters.dependency ?? "",
				type: filters.type ?? "",
				status: filters.status ?? "active",
				sortBy: filters.sortBy ?? "createdAt",
				sortDir: filters.sortDir ?? "desc",
			},
		},
		{ pagination: result.pagination },
	);
};
