import { hasRole as hasRoleFn, type Role } from "@/shared/rules/atoms.rules";
import { useAuth } from "./use-auth";

/**
 * Guard de rol del lado del cliente — SOLO UX.
 *
 * La autorización real la impone requireRole en el servidor; ocultar un botón no
 * protege nada, solo evita mostrar accesos que fallarían con 403.
 */
export function useRole(): {
	role: Role;
	hasRole: (allowed: readonly Role[]) => boolean;
} {
	const { role } = useAuth();

	return {
		role,
		hasRole: (allowed) => hasRoleFn(role, allowed),
	};
}
