import { forbiddenRole } from "@/shared/auth/forbidden-role";
import { requireScope } from "@/shared/auth/require-scope.server";
import { ok } from "@/shared/response/response.helpers";
import {
	canManageGroups,
	GROUP_ACCESS_ROLES,
	GROUP_MANAGER_ROLES,
} from "../../../domain/group.access";
import type { Route } from "./+types/index";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { auth, scope } = await requireScope(
		request,
		context,
		GROUP_ACCESS_ROLES,
	);

	// 🔒 Un grupo pertenece forzosamente a una dependencia: con alcance global no
	// hay a cuál asignarlo. Se corta en el loader para no pintar un formulario
	// que no se podría enviar.
	if (!canManageGroups(scope)) throw forbiddenRole(GROUP_MANAGER_ROLES);

	return ok({ auth });
};
