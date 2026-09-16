/**
 * Valores por defecto del listado.
 *
 * Fuente ÚNICA: los usan el loader (para normalizar el query string), el
 * servicio (para construir la `pagination` de la respuesta) y el repositorio
 * (para el skip/take). Dos defaults distintos producen una `pagination` que no
 * describe la página que realmente se consultó.
 */
export const DEPENDENCY_LIST_DEFAULTS = {
	page: 1,
	pageSize: 10,
} as const;
