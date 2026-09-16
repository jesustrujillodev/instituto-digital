import type { ReactNode } from "react";
import { useRole } from "@/shared/hooks/use-role";
import type { Role } from "@/shared/rules/atoms.rules";

interface RoleGuardProps {
	allowedRoles: readonly Role[];
	children: ReactNode;
	fallback?: ReactNode;
	/** Invierte la condición: renderiza cuando el rol NO está en la lista. */
	invert?: boolean;
}

/**
 * Envoltorio declarativo para condicionar JSX por rol — SOLO UX.
 *
 * `allowedRoles={["ADMIN"]}` no contradice la doctrina de "nunca comparar
 * strings de rol inline": es una decisión declarativa y tipada, de la misma
 * forma que `requireRole(request, context, ["ADMIN"])`. Lo prohibido es la
 * comparación ad-hoc `auth.role === "ADMIN"` incrustada en el markup.
 */
export function RoleGuard({
	allowedRoles,
	children,
	fallback = null,
	invert = false,
}: RoleGuardProps) {
	const { hasRole } = useRole();
	const matches = hasRole(allowedRoles);
	const allowed = invert ? !matches : matches;

	return <>{allowed ? children : fallback}</>;
}
