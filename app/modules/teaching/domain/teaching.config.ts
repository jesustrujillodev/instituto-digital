import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { Role } from "@/shared/rules/atoms.rules";

export const TEACHING_LIST_DEFAULTS = {
	page: 1,
	pageSize: 12,
} as const;

/** Múltiplos de 2, 3 y 4: ninguna columna de la cuadrícula queda coja. */
export const TEACHING_PAGE_SIZES = [12, 24, 48] as const;

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

/** Por qué todavía no se puede finalizar un curso. */
export const FINISH_BLOCKERS = [
	"NOT_PUBLISHED",
	"WITHOUT_SESSIONS",
	"TOO_EARLY",
	"PENDING_RESULTS",
] as const;
export type FinishBlocker = (typeof FINISH_BLOCKERS)[number];
