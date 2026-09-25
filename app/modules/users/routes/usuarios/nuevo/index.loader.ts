import { DEPENDENCY_ERROR_MESSAGES } from "@/modules/dependencies/utils/dependency-error-messages";
import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	assignableRoles,
	USER_MANAGER_ROLES,
} from "../../../domain/user.access.rules";
import type { Route } from "./+types/index";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Cada ruta impone su propio guard: estar bajo /dashboard solo garantiza
	// sesión, no el rol necesario para administrar cuentas.
	const { auth, scope } = await requireScope(
		request,
		context,
		USER_MANAGER_ROLES,
	);

	// El superadministrador elige entre las activas. El titular y el auxiliar
	// reciben solo la suya, ya elegida: la regla del formulario exige dependencia
	// a todo interno, y un campo fijo pero vacío no dejaría guardar.
	const isGlobal = scope.kind === "global";

	const dependencies = isGlobal
		? await context.dependencyService.listActive()
		: scope.kind === "dependency"
			? await context.dependencyService.findByInternalId(scope.dependencyId)
			: null;
	if (dependencies && !dependencies.success) {
		throw toRouteError(dependencies.error, DEPENDENCY_ERROR_MESSAGES);
	}

	const options = !dependencies
		? []
		: Array.isArray(dependencies.data)
			? dependencies.data
			: [dependencies.data];

	// Los roles asignables los decide el dominio a partir del rol del actor, y se
	// resuelven en el servidor: el `Select` no puede ofrecer lo que el action
	// rechazaría.
	return ok({
		auth,
		canChooseDependency: isGlobal,
		dependencies: options.map(({ documentId, name }) => ({ documentId, name })),
		defaultDependency: isGlobal ? null : (options[0]?.documentId ?? null),
		assignableRoles: assignableRoles(auth.role),
	});
};
