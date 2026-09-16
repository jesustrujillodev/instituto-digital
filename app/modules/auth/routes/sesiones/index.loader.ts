import { parseTokenCookies } from "@/core/cookies.server";
import { requireRole } from "@/shared/auth/require-role.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { SESSION_LIST_DEFAULTS } from "../../domain/auth.config";
import { SESSION_MONITOR_ROLES } from "../../domain/auth.rules";
import { validateListSessions } from "../../domain/auth.validators";
import { SESSION_MONITOR_ERROR_MESSAGES } from "../../utils/session-monitor-error-messages";
import type { Route } from "./+types/index";

/** Entero positivo del query string, o `undefined` si no viene o es basura. */
const readNumber = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Solo los roles de plataforma — un rol insuficiente produce un 403 real
	// (no un redirect), que pinta dashboard.boundary.tsx conservando el shell.
	const auth = await requireRole(request, context, SESSION_MONITOR_ROLES);

	// La cookie sirve para marcar la fila propia, no para autenticar: eso ya lo
	// hizo el middleware. Se pasa cruda porque hashearla es del servicio.
	const { refreshToken } = await parseTokenCookies(
		request.headers.get("Cookie"),
	);

	const { searchParams } = new URL(request.url);

	// Los filtros viven en la URL y no en estado local: así la vista es
	// enlazable, sobrevive a un refresh y el botón "atrás" hace lo esperado.
	const filters = validateListSessions({
		page: readNumber(searchParams.get("page")) ?? SESSION_LIST_DEFAULTS.page,
		pageSize:
			readNumber(searchParams.get("pageSize")) ??
			SESSION_LIST_DEFAULTS.pageSize,
		search: searchParams.get("search") || undefined,
		userId: readNumber(searchParams.get("userId")),
		status: searchParams.get("status") || undefined,
		// El orden también es del servidor: con paginación, ordenar en el cliente
		// solo reordenaría la página visible y mentiría sobre el conjunto.
		sortBy: searchParams.get("sortBy") || undefined,
		sortDir: searchParams.get("sortDir") || undefined,
	});

	const [result, securityStateResult] = await Promise.all([
		context.sessionMonitorService.list(filters, refreshToken ?? undefined),
		context.securityStateService.getState(),
	]);

	// Un loader que falla no tiene pantalla que mostrar: corta con el status del
	// código y deja el error al ErrorBoundary.
	if (!result.success) {
		throw toRouteError(result.error, SESSION_MONITOR_ERROR_MESSAGES);
	}
	if (!securityStateResult.success) {
		throw toRouteError(
			securityStateResult.error,
			SESSION_MONITOR_ERROR_MESSAGES,
		);
	}

	return ok(
		{
			auth,
			sessions: result.data,
			// Revocar UNA sesión suelta no corta el acceso en curso: lo corta al
			// expirar su access token, porque el epoch es global o por usuario,
			// nunca por sesión (docs/auth/02 §latencias).
			revocationWindowS: context.authConfig.accessTokenTtlS,
			// Revocar por usuario o cerrar todas sí es inmediato: sube el epoch. El
			// único retraso es lo que tarda en propagarse entre nodos, que es el TTL
			// de la caché del estado de seguridad.
			// Ambos números salen del servidor y no de literales en la vista: así el
			// texto no miente si cambia la variable de entorno.
			propagationS: context.authConfig.securityStateCacheTtlS,
			securityState: securityStateResult.data,
			filters: {
				search: filters.search ?? "",
				status: filters.status ?? "active",
				sortBy: filters.sortBy ?? "createdAt",
				sortDir: filters.sortDir ?? "desc",
			},
		},
		{ pagination: result.pagination },
	);
};
