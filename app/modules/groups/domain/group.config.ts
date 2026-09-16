/**
 * Valores por defecto del listado.
 *
 * Fuente ÚNICA: los usan el loader, el servicio (para la `pagination`) y el
 * repositorio (para el skip/take). Dos defaults distintos producen una
 * `pagination` que no describe la página consultada.
 */
export const GROUP_LIST_DEFAULTS = {
	page: 1,
	pageSize: 10,
} as const;

/**
 * Tope del selector de miembros.
 *
 * Es una lista para elegir a mano, no un listado paginado: por encima de esto la
 * vía es acotar con el buscador, no pasar páginas dentro de un diálogo.
 */
export const MEMBER_CANDIDATES_LIMIT = 50;
