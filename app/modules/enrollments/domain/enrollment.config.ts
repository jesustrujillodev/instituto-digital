export const ENROLLMENT_ORIGINS = ["SELF", "ASSIGNED", "INVITATION"] as const;
export type EnrollmentOrigin = (typeof ENROLLMENT_ORIGINS)[number];

export const ENROLLMENT_STATUSES = [
	"INVITED",
	"ENROLLED",
	"DECLINED",
	"WITHDRAWN",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_RESULTS = ["PENDING", "PASSED", "FAILED"] as const;
export type EnrollmentResult = (typeof ENROLLMENT_RESULTS)[number];

/** Estados que dan acceso al curso e impiden volver a invitar. */
export const ACTIVE_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
	"INVITED",
	"ENROLLED",
];

/**
 * Valores por defecto del catálogo.
 *
 * `pageSize` es divisible entre 2, 3 y 4, que son las columnas de la cuadrícula
 * en cada punto de corte: con 10 la última fila siempre queda coja.
 */
export const AVAILABLE_LIST_DEFAULTS = {
	page: 1,
	pageSize: 12,
} as const;

/** Tamaños de página que ofrece el catálogo, todos múltiplos de 12. */
export const AVAILABLE_PAGE_SIZES = [12, 24, 48] as const;

/**
 * Días que quedan para que el catálogo marque una inscripción como urgente.
 *
 * El cálculo vive en el servidor —donde está el reloj inyectado— y viaja como
 * booleano: hacerlo en el navegador compararía contra la hora del equipo de
 * cada quien y produciría una tarjeta distinta en el servidor y en el cliente.
 */
export const ENROLLMENT_CLOSING_SOON_DAYS = 7;

export const ENROLLMENT_CANDIDATES_LIMIT = 20;

/** Tope de personas por envío de asignación o invitación. */
export const ENROLLMENT_BATCH_LIMIT = 200;
