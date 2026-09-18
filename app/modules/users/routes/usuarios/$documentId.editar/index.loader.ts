import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { requireScope } from "@/shared/auth/require-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import {
	assignableRoles,
	canChangeUserDependency,
	USER_MANAGER_ROLES,
} from "../../../domain/user.access.rules";
import type { SafeUser } from "../../../domain/user.types";
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

	const user = result.data;

	return ok({
		user,
		// La bitácora es informativa: si falla, la pantalla de edición sigue
		// sirviendo. Cortarla entera por el historial sería peor.
		history: history.success ? history.data : [],
		assignableRoles: assignableRoles(auth.role),
		dependencyChange: await loadDependencyChange(context, auth, user),
	});
};

/**
 * Lo que la sección de adscripción ofrece a este actor sobre esta cuenta.
 *
 * `null` = no le toca: la sección queda como bitácora sin controles. Al titular
 * se le explica el motivo en vez de esconder el control, para que se sepa que
 * primero hay que designar a otro.
 */
const loadDependencyChange = async (
	context: Route.LoaderArgs["context"],
	auth: AuthContext,
	user: SafeUser,
) => {
	if (!canChangeUserDependency(auth, user)) return null;
	if (user.role === "DEPENDENCY_HEAD") return { kind: "head" as const };

	// El nombre actual va por id interno y no por el catálogo de activas: una
	// dependencia desactivada no saldría ahí y parecería que no tiene ninguna.
	const [current, active] = await Promise.all([
		user.dependencyId === null
			? Promise.resolve(null)
			: context.dependencyService.findByInternalId(user.dependencyId),
		context.dependencyService.listActive(),
	]);

	return {
		kind: "available" as const,
		currentName: current?.success === true ? current.data.name : null,
		// Una desactivada no es destino (regla 8), y la actual no es un cambio.
		options: active.success
			? active.data
					.filter((dependency) => dependency.id !== user.dependencyId)
					.map(({ documentId, name }) => ({ documentId, name }))
			: [],
	};
};
