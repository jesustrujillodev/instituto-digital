export const NOTIFICATION_TEMPLATES = [
	"ACCOUNT_CREATED",
	"PASSWORD_RESET",
	"DEPENDENCY_CHANGED",
	"COURSE_INVITATION",
	"ENROLLMENT_CONFIRMED",
	"ENROLLMENT_ASSIGNED",
	"COURSE_UPDATED",
	"COURSE_CANCELLED",
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

/**
 * Espera antes de cada reintento, en minutos. Un mensaje se intenta una vez más
 * que reintentos hay: si falla también tras el de 12 h, queda `FAILED`.
 */
export const RETRY_DELAYS_MIN = [1, 5, 30, 120, 720] as const;

export const OUTBOX_BATCH_SIZE = 20;

/** Cuánto reserva un worker los mensajes que tomó. Mayor que un envío lento. */
export const OUTBOX_LEASE_MS = 5 * 60 * 1000;

/** Los enviados se purgan: la cola no es una bitácora (§8 del alcance). */
export const SENT_RETENTION_DAYS = 30;

export const LAST_ERROR_MAX_LENGTH = 500;

export const PLATFORM_NAME = "Instituto Digital de Capacitación";
