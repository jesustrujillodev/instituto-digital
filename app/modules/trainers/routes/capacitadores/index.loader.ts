import { forbiddenRole } from "@/shared/auth/forbidden-role";
import { requireAuth } from "@/shared/auth/require-auth.server";
import { resolveScope } from "@/shared/auth/scope.rules";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	canAdministerTrainers,
	canViewCatalog,
	TRAINER_CATALOG_ROLES,
} from "../../domain/trainer.access";
import { TRAINER_LIST_DEFAULTS } from "../../domain/trainer.config";
import { validateListTrainers } from "../../domain/trainer.validators";
import { TRAINER_ERROR_MESSAGES } from "../../utils/trainer-error-messages";
import type { Route } from "./+types/index";

/**
 * Tope del selector de activación. Es el máximo que admite `basePaginationSchema`
 * y basta para el personal de una dependencia; si alguna creciera más, el camino
 * es activar desde la ficha de la persona en `/dashboard/usuarios`.
 */
const ACTIVATION_CANDIDATES_LIMIT = 100;

/** Entero positivo del query string, o `undefined` si no viene o es basura. */
const readNumber = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Es el único guard del sistema que no depende solo del rol: §3 del alcance
	// deja consultar el catálogo a cualquier capacitador, y eso no se expresa con
	// una lista de roles.
	const auth = await requireAuth(request, context);
	if (!canViewCatalog(auth)) throw forbiddenRole(TRAINER_CATALOG_ROLES);

	const { searchParams } = new URL(request.url);

	const filters = validateListTrainers({
		page: readNumber(searchParams.get("page")) ?? TRAINER_LIST_DEFAULTS.page,
		pageSize:
			readNumber(searchParams.get("pageSize")) ??
			TRAINER_LIST_DEFAULTS.pageSize,
		search: searchParams.get("search") || undefined,
		type: searchParams.get("type") || undefined,
		specialty: searchParams.get("specialty") || undefined,
		status: searchParams.get("status") || undefined,
		sortBy: searchParams.get("sortBy") || undefined,
		sortDir: searchParams.get("sortDir") || undefined,
	});

	// Ver el catálogo y modificarlo son dos permisos distintos: la pantalla es la
	// misma y las acciones aparecen solo para quien administra.
	const canManage = canAdministerTrainers(auth.role);

	const result = await context.trainerService.list(filters);

	if (!result.success) {
		throw toRouteError(result.error, TRAINER_ERROR_MESSAGES);
	}

	// Candidatos para el diálogo de activación: personal DENTRO DEL ALCANCE que
	// todavía no tiene perfil. Se piden solo si hay algo que activar — para un
	// participante con perfil, el catálogo es de lectura y la lista sobraría.
	const candidates = canManage
		? await context.userService.list(
				{
					pageSize: ACTIVATION_CANDIDATES_LIMIT,
					status: "active",
					trainer: "no",
					sortBy: "firstName",
					sortDir: "asc",
				},
				resolveScope(auth),
			)
		: null;

	if (candidates && !candidates.success) {
		throw toRouteError(candidates.error, TRAINER_ERROR_MESSAGES);
	}

	return ok(
		{
			auth,
			trainers: result.data,
			canManage,
			candidates: candidates?.success ? candidates.data : [],
			filters: {
				search: filters.search ?? "",
				type: filters.type ?? "",
				specialty: filters.specialty ?? "",
				status: filters.status ?? "active",
				sortBy: filters.sortBy ?? "firstName",
				sortDir: filters.sortDir ?? "asc",
			},
		},
		{ pagination: result.pagination },
	);
};
