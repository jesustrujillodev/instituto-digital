import type { AccessScope } from "@/shared/auth/scope.rules";
import type { Role } from "@/shared/rules/atoms.rules";

/**
 * Quién ENTRA al plan anual. El superadministrador consulta y el titular y los
 * auxiliares gestionan el de su dependencia (§3); la escritura la corta
 * `canManagePlans`, no el rol.
 */
export const PLAN_ACCESS_ROLES: readonly Role[] = [
	"SUPERADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

export type PlanScopeWhere = { id?: { in: number[] }; dependencyId?: number };

/** Filtro de lectura; `self` y `none` nunca se convierten en `{}`. */
export const planScopeWhere = (scope: AccessScope): PlanScopeWhere => {
	switch (scope.kind) {
		case "global":
			return {};
		case "dependency":
			return { dependencyId: scope.dependencyId };
		case "self":
		case "none":
			return { id: { in: [] } };
		default: {
			const exhaustive: never = scope;
			return exhaustive;
		}
	}
};

type DependencyScope = Extract<AccessScope, { kind: "dependency" }>;

/** Un plan pertenece a una dependencia: solo ese alcance lo escribe. */
export const canManagePlans = (scope: AccessScope): scope is DependencyScope =>
	scope.kind === "dependency";
