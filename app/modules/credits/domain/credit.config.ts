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
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

/** Alcance de caché que invalida toda escritura de créditos. */
export const CREDITS_CACHE_SCOPE = "credits";

/**
 * El resumen por dependencia es la vista más cara de "Créditos": dos consultas
 * en serie sobre todo el ejercicio. El TTL solo acota un aviso perdido.
 */
export const CREDITS_SUMMARY_CACHE = {
	name: "credits-summary",
	ttlS: 300,
} as const;
