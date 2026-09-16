/**
 * Valores por defecto del listado.
 *
 * Fuente ÚNICA: los usan el loader, el servicio (para la `pagination`) y el
 * repositorio (para el skip/take). Dos defaults distintos producen una
 * `pagination` que no describe la página consultada.
 */
export const COURSE_LIST_DEFAULTS = {
	page: 1,
	pageSize: 10,
} as const;

/**
 * Asistencia mínima por defecto, en porcentaje.
 *
 * El 80 sale de §6.8 del alcance y se ajusta por curso. Vive aquí y no en el
 * `@default` de Prisma únicamente porque el formulario tiene que precargarlo:
 * la columna conserva su propio default para las escrituras que no lo manden.
 */
export const COURSE_DEFAULTS = {
	minAttendance: 80,
} as const;

/**
 * Tope de sesiones por curso.
 *
 * §6.5 admite desde una sesión hasta varias semanas de sesiones. El límite no
 * es de negocio sino del formulario: por encima de esto el `useFieldArray`
 * deja de ser una forma razonable de capturarlas.
 */
export const COURSE_MAX_SESSIONS = 60;
