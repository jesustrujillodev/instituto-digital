import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Role } from "@/shared/rules/atoms.rules";
import { requireRole } from "./require-role.server";
import { type AccessScope, resolveScope } from "./scope.rules";

/**
 * `requireRole` y `resolveScope` en un solo acto.
 *
 * Existe para que no se pueda acertar el rol y olvidar el alcance. Son dos
 * decisiones que siempre van juntas —quién entra y hasta dónde llega— y
 * separarlas deja una puerta abierta que compila: un loader con el guard
 * correcto y una consulta sin filtrar devuelve las cuentas de todas las
 * dependencias.
 *
 * Usage:
 *   const { auth, scope } = await requireScope(request, context, MANAGER_ROLES);
 */
export async function requireScope(
	request: Request,
	context: ICradle,
	roles: readonly Role[],
	options?: { redirectTo?: string },
): Promise<{ auth: AuthContext; scope: AccessScope }> {
	const auth = await requireRole(request, context, roles, options);

	return { auth, scope: resolveScope(auth) };
}
