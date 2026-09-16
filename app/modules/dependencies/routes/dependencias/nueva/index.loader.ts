import { requireRole } from "@/shared/auth/require-role.server";
import { ok } from "@/shared/response/response.helpers";
import { DEPENDENCY_ADMIN_ROLES } from "../../../domain/dependency.access";
import type { Route } from "./+types/index";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Cada ruta impone su propio guard: estar bajo /dashboard solo garantiza
	// sesión, no el rol necesario para crear unidades organizativas.
	const auth = await requireRole(request, context, DEPENDENCY_ADMIN_ROLES);

	// Sin servicio de por medio, pero con el mismo envelope: la pantalla lee la
	// misma forma venga de donde venga el dato.
	return ok({ auth });
};
