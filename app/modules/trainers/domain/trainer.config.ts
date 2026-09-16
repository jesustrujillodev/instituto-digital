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
