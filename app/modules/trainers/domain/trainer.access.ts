import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { canManageUser } from "@/modules/users/domain/user.access.rules";
import type { UserType } from "@/modules/users/domain/user.rules";
import type { SafeUser } from "@/modules/users/domain/user.types";
import { hasRole, type Role } from "@/shared/rules/atoms.rules";

/** Quién activa perfiles y registra capacitadores externos. */
export const TRAINER_ADMIN_ROLES: readonly Role[] = [
	"SUPERADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

/** Quién puede activar, editar o desactivar perfiles. */
export const canAdministerTrainers = (actorRole: Role): boolean =>
	hasRole(actorRole, TRAINER_ADMIN_ROLES);

/**
 * ¿Puede este actor administrar el perfil de esta cuenta?
 *
 * Sobre un interno manda la jerarquía de `users`: alcance y rango. Sobre un
 * externo no puede mandar, porque no tiene dependencia y ningún titular lo
 * alcanzaría; ahí basta el rol de administración, que es lo que dice la matriz
 * al no acotar esa fila a "su dep.".
 */
export const canManageTrainer = (
	actor: Pick<AuthContext, "userId" | "role" | "dependencyId">,
	target: Pick<SafeUser, "id" | "role" | "dependencyId"> & { type: UserType },
): boolean =>
	target.type === "EXTERNAL"
		? canAdministerTrainers(actor.role)
		: canAdministerTrainers(actor.role) && canManageUser(actor, target);
