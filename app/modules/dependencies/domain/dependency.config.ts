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

/**
 * Alcance de caché de los datos de dependencias que otros módulos agregan
 * (nombre, estado). Toda escritura de una dependencia lo invalida.
 */
export const DEPENDENCIES_CACHE_SCOPE = "dependencies";

/**
 * Nombre de la dependencia de acogida: la crea la migración inicial para
 * reubicar las cuentas anteriores al modelo. No es una unidad que opere, así que
 * lo que le pide a una dependencia —titular, plan anual— no se le reclama.
 */
export const UNASSIGNED_DEPENDENCY = "Sin asignar";
