/**
 * Valores por defecto del catálogo.
 *
 * Fuente ÚNICA: los usan el loader, el servicio (para la `pagination`) y el
 * repositorio (para el skip/take). Dos defaults distintos producen una
 * `pagination` que no describe la página consultada.
 */
export const TRAINER_LIST_DEFAULTS = {
	page: 1,
	pageSize: 10,
} as const;

/**
 * Cursos impartidos y valoración promedio mientras no existan sus tablas.
 *
 * Se devuelven desde el servicio y no desde la UI para que la forma del DTO
 * quede fijada ahora: PRD-03 y PRD-06 sustituyen el cálculo, no el contrato.
 */
export const TRAINER_STATS_PENDING = {
	coursesTaught: 0,
	averageRating: null,
} as const;
