import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import {
	assignableRoles,
	USER_MANAGER_ROLES,
} from "../../../domain/user.access.rules";
import { validateFindUser } from "../../../domain/user.validators";
import { USER_ERROR_MESSAGES } from "../../../utils/user-error-messages";
import type { Route } from "./+types/index";

export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth, scope } = await requireScope(
		request,
		context,
		USER_MANAGER_ROLES,
	);

	// Un documentId con formato inválido y un usuario inexistente terminan igual:
	// un status del diccionario del módulo (404 para USER_NOT_FOUND, 400 para la
	// validación). Antes esta ruta respondía 404 en el loader y un fieldError en
	// el action ante la misma URL malformada.
	const input = parseInput(
		() => validateFindUser({ documentId: params.documentId }).documentId,
	);
	if (!input.success) throw toRouteError(input.error, USER_ERROR_MESSAGES);

	// Criterio de aceptación 2 del PRD: un titular que abra por URL directa el
	// detalle de alguien de otra dependencia recibe 404 y no el registro. Lo impone
	// el alcance dentro del propio `where`, no una comprobación posterior.
	const [result, history] = await Promise.all([
		context.userService.findById(input.data, scope),
		context.userService.listDependencyHistory(input.data, scope),
	]);
	if (!result.success) throw toRouteError(result.error, USER_ERROR_MESSAGES);

	return ok({
		user: result.data,
		// La bitácora es informativa: si falla, la pantalla de edición sigue
		// sirviendo. Cortarla entera por el historial sería peor.
		history: history.success ? history.data : [],
		assignableRoles: assignableRoles(auth.role),
	});
};
