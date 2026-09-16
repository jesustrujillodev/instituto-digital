import type { Role } from "@/shared/rules/atoms.rules";

export const CREDIT_LIST_DEFAULTS = {
	page: 1,
	pageSize: 20,
} as const;

/** Ejercicios que se aceptan pedir por la URL. */
export const CREDIT_YEAR_RANGE = { min: 2000, max: 2100 } as const;

/**
 * Roles que entran a "Créditos". El alcance decide qué ven: el titular y el
 * auxiliar, su personal; el superadministrador, el resumen por dependencia.
 */
export const CREDIT_MANAGER_ROLES: readonly Role[] = [
	"SUPERADMIN",
	"ADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];
