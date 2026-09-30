import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { Role } from "@/shared/rules/atoms.rules";
import { canAssignRole } from "./user.access.rules";
import type { SafeUser } from "./user.types";

/**
 * Reglas de CAMBIO de rol sobre una cuenta existente. Van aparte de
 * `user.access.rules.ts` por el límite de 300 líneas de `docs/reglas.md` §21.
 */

/**
 * Por qué este actor no puede cambiar el rol de esta cuenta.
 *
 * - `head`: la titularidad no se retira desde aquí; dejaría a la dependencia sin
 *   titular saltándose el relevo.
 * - `self`: nadie cambia su propio rol. Un superadministrador que se degradara
 *   no podría devolverse el rol.
 * - `rank`: quitar un rol exige poder otorgarlo.
 * - `dependency`: un superadministrador sin dependencia no puede bajar a ningún
 *   otro rol, porque todos exigen una (CHECK `users_type_coherence`). Primero se
 *   le asigna con "Cambiar dependencia", que deja bitácora.
 *
 * `head` se evalúa primero aunque `rank` ya lo cubra: es el motivo que le dice a
 * quien edita adónde ir.
 */
export type RoleLock = "head" | "self" | "rank" | "dependency";

export const roleLockOf = (
	actor: Pick<AuthContext, "userId" | "role">,
	target: Pick<SafeUser, "id" | "role" | "dependencyId">,
): RoleLock | null => {
	if (target.role === "DEPENDENCY_HEAD") return "head";
	if (target.id === actor.userId) return "self";
	if (!canAssignRole(actor.role, target.role)) return "rank";
	if (target.role === "SUPERADMIN" && target.dependencyId === null) {
		return "dependency";
	}
	return null;
};

/**
 * ¿Puede este actor dejar esta cuenta con `nextRole`?
 *
 * Conservar el rol no otorga nada, así que no pide permiso: el formulario de
 * edición siempre reenvía el rol actual, también el de un titular, que nadie
 * puede otorgar.
 */
export const canChangeRole = (
	actor: Pick<AuthContext, "userId" | "role">,
	target: Pick<SafeUser, "id" | "role" | "dependencyId">,
	nextRole: Role,
): boolean =>
	target.role === nextRole ||
	(roleLockOf(actor, target) === null && canAssignRole(actor.role, nextRole));

/**
 * ¿Dejaría al sistema sin superadministrador activo sacar a esta cuenta?
 *
 * `activeSuperadminIds` tiene que leerse bajo bloqueo en la misma transacción que
 * la escritura: con una lectura suelta, dos superadministradores que se archivan
 * entre sí a la vez verían cada uno al otro y los dos pasarían.
 */
export const leavesNoActiveSuperadmin = (
	activeSuperadminIds: readonly number[],
	targetId: number,
): boolean =>
	activeSuperadminIds.includes(targetId) && activeSuperadminIds.length === 1;
