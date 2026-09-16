import { requireScope } from "@/shared/auth/require-scope.server";
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

	// El catálogo solo hace falta con alcance global: el superadministrador elige
	// dependencia, y el titular y el auxiliar la tienen fija en la suya. Pedirlo
	// igualmente enseñaría destinos que el formulario no va a usar.
	const isGlobal = scope.kind === "global";

	const dependencies = isGlobal
		? await context.dependencyService.listActive()
		: null;

	// Los roles asignables los decide el dominio a partir del rol del actor, y se
	// resuelven en el servidor: el `Select` no puede ofrecer lo que el action
	// rechazaría.
	return ok({
		auth,
		canChooseDependency: isGlobal,
		dependencies: dependencies?.success ? dependencies.data : [],
		assignableRoles: assignableRoles(auth.role),
	});
};
