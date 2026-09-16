import { requireAuth } from "@/shared/auth/require-auth.server";
import { resolveScope } from "@/shared/auth/scope.rules";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { canChangeOwnDependency } from "../../domain/user.access.rules";
import { USER_ERROR_MESSAGES } from "../../utils/user-error-messages";
import type { Route } from "./+types/index";

/**
 * El perfil propio. Único punto del dashboard con `requireAuth` y sin rol: aquí
 * no se administra a nadie más, así que exigir un rol dejaría fuera precisamente
 * a los participantes, que son quienes más lo usan.
 */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireAuth(request, context);
	const scope = resolveScope(auth);

	const [result, history] = await Promise.all([
		context.userService.findById(auth.documentId, scope),
		context.userService.listDependencyHistory(auth.documentId, scope),
	]);
	if (!result.success) throw toRouteError(result.error, USER_ERROR_MESSAGES);

	const user = result.data;

	// Se resuelve por id interno y no buscándola en el catálogo de activas: si la
	// dependencia estuviera desactivada, el catálogo no la traería y el perfil
	// diría "sin dependencia" de alguien que sí la tiene.
	const [dependency, options] = await Promise.all([
		user.dependencyId === null
			? Promise.resolve(null)
			: context.dependencyService.findByInternalId(user.dependencyId),
		context.dependencyService.listActive(),
	]);

	return ok({
		user,
		dependencyName: dependency?.success === true ? dependency.data.name : null,
		// Una desactivada no puede ser destino (regla 8), así que ni se ofrece.
		dependencies: options.success ? options.data : [],
		// El titular no puede cambiarse mientras lo sea: la pantalla lo explica en
		// vez de esconder el control, para que se sepa qué hay que hacer antes.
		canChangeDependency: canChangeOwnDependency(auth.role, user.type),
		history: history.success ? history.data : [],
	});
};
