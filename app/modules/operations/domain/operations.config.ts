import type { Role } from "@/shared/rules/atoms.rules";

/** Operación es de la plataforma, no de una dependencia. */
export const OPERATIONS_ROLES: readonly Role[] = ["SUPERADMIN"];

export const OPERATIONS_TABS = ["emails", "jobs"] as const;
export type OperationsTab = (typeof OPERATIONS_TABS)[number];

/** Los mismos que ofrece el selector de la tabla compartida. */
export const OPERATIONS_PAGE_SIZES = [10, 20, 25, 50] as const;

export const OPERATIONS_LIST_DEFAULTS = {
	tab: "emails",
	page: 1,
	pageSize: 20,
} as const satisfies {
	tab: OperationsTab;
	page: number;
	pageSize: (typeof OPERATIONS_PAGE_SIZES)[number];
};

/** Ventana de los trabajos fallidos que cuenta el panel de inicio. */
export const JOB_FAILURE_WINDOW_DAYS = 7;

/**
 * Minutos de retraso sobre su turno a partir de los cuales un correo pendiente
 * se da por atascado. El reintento ya está en `nextAttemptAt`: lo que pasa de
 * esta holgura es un worker que no está vaciando la cola.
 */
export const STUCK_EMAIL_MINUTES = 30;

/** Caracteres del error que enseña la tabla; el texto completo queda en el título. */
export const ERROR_PREVIEW_LENGTH = 160;
