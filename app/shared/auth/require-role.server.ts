import { redirect } from "react-router";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { hasRole, type Role } from "@/shared/rules/atoms.rules";
import { forbiddenRole } from "./forbidden-role";
import { requireAuth } from "./require-auth.server";

/**
 * ÚNICO punto de decisión de autorización por rol — los loaders/actions nunca
 * comparan strings de rol inline. Los roles disponibles se editan en un solo
 * lugar: shared/rules/atoms.rules.ts (ROLES).
 *
 * - No autenticado         → redirect a /iniciar-sesion (vía requireAuth).
 * - Autenticado sin el rol → 403, que pinta el ErrorBoundary. Un 403 dice la
 *   verdad: el recurso existe y la sesión es válida; lo que falta es permiso.
 *   Además conserva la URL intentada, cosa que un redirect perdería.
 * - `options.redirectTo`   → escotilla OPT-IN para flujos que prefieran
 *   reencaminar en vez de cortar (p. ej. onboarding incompleto).
 *
 * Usage:
 *   const auth = await requireRole(request, context, ["ADMIN"]);
 */
export async function requireRole(
	request: Request,
	context: ICradle,
	roles: readonly Role[],
	options?: { redirectTo?: string },
): Promise<AuthContext> {
	const auth = await requireAuth(request, context);

	if (hasRole(auth.role, roles)) return auth;

	if (options?.redirectTo) throw redirect(options.redirectTo);

	throw forbiddenRole(roles);
}
