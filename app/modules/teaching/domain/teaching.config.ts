import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { Role } from "@/shared/rules/atoms.rules";

export const TEACHING_LIST_DEFAULTS = {
	page: 1,
	pageSize: 12,
} as const;

/** Múltiplos de 2, 3 y 4: ninguna columna de la cuadrícula queda coja. */
export const TEACHING_PAGE_SIZES = [12, 24, 48] as const;

/**
 * Campos ordenables. Es una allowlist: el valor llega del query string y acaba
 * en un `orderBy`.
 */
export const TEACHING_SORT_FIELDS = ["status", "title", "updatedAt"] as const;
export type TeachingSortField = (typeof TEACHING_SORT_FIELDS)[number];

/** Publicados primero: son los que todavía piden lista o cierre. */
export const TEACHING_SORT_DEFAULT = {
	sortBy: "status",
	sortDir: "desc",
} as const satisfies { sortBy: TeachingSortField; sortDir: "asc" | "desc" };

/** Un borrador no se imparte y un cancelado ya no: solo estos pasan lista. */
export const TEACHABLE_STATUSES = [
	"PUBLISHED",
	"FINISHED",
] as const satisfies readonly CourseStatus[];
export type TeachableStatus = (typeof TEACHABLE_STATUSES)[number];

/** Tope de filas por envío de lista o de resultados. */
export const TEACHING_BATCH_LIMIT = 500;

/**
 * Solo redacta el 403. La condición real también admite a cualquier
 * capacitador, que suele tener rol `USER`: no es un rol.
 */
export const TEACHING_ROLES: readonly Role[] = [
	"SUPERADMIN",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

/**
 * Por qué no se puede finalizar un curso. `SELF_PACED` no es un "todavía": un
 * autogestivo no se finaliza nunca, cada quien lo completa (docs/adr/0014).
 */
export const FINISH_BLOCKERS = [
	"NOT_PUBLISHED",
	"SELF_PACED",
	"WITHOUT_SESSIONS",
	"TOO_EARLY",
	"PENDING_RESULTS",
] as const;
export type FinishBlocker = (typeof FINISH_BLOCKERS)[number];
