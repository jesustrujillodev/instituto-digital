import type { DefaultJobOptions } from "bullmq";

/**
 * Una cola por perfil de recursos, no por trabajo: un recálculo pesado no
 * retrasa un correo de recuperar contraseña (docs/queues/00-colas.md).
 */
export const QUEUE_NAMES = {
	emails: "emails",
	courseSync: "course-sync",
	storage: "storage",
	maintenance: "maintenance",
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
	deliverEmail: "deliver-email",
	sweepOutbox: "sweep-outbox",
	recalculateProgress: "recalculate-progress",
	deleteObject: "delete-object",
	purgeExpiredSessions: "purge-expired-sessions",
	purgeSentEmails: "purge-sent-emails",
	purgeJobFailures: "purge-job-failures",
} as const;
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/** Los que un caso de uso encola; el resto solo los programa el worker. */
export type DispatchableJob =
	| typeof JOB_NAMES.deliverEmail
	| typeof JOB_NAMES.recalculateProgress
	| typeof JOB_NAMES.deleteObject;

export const QUEUE_OF: Record<JobName, QueueName> = {
	[JOB_NAMES.deliverEmail]: QUEUE_NAMES.emails,
	[JOB_NAMES.sweepOutbox]: QUEUE_NAMES.emails,
	[JOB_NAMES.recalculateProgress]: QUEUE_NAMES.courseSync,
	[JOB_NAMES.deleteObject]: QUEUE_NAMES.storage,
	[JOB_NAMES.purgeExpiredSessions]: QUEUE_NAMES.maintenance,
	[JOB_NAMES.purgeSentEmails]: QUEUE_NAMES.maintenance,
	[JOB_NAMES.purgeJobFailures]: QUEUE_NAMES.maintenance,
};

const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;

/**
 * El correo va con un solo intento: su horario de reintentos vive en la fila
 * del outbox, que es la fuente de verdad (docs/adr/0008).
 */
export const QUEUE_DEFAULTS: Record<QueueName, DefaultJobOptions> = {
	[QUEUE_NAMES.emails]: {
		attempts: 1,
		removeOnComplete: { age: 6 * HOUR_S },
		removeOnFail: { age: 7 * DAY_S },
	},
	[QUEUE_NAMES.courseSync]: {
		attempts: 3,
		backoff: { type: "exponential", delay: 30_000 },
		removeOnComplete: { age: DAY_S },
		removeOnFail: { age: 14 * DAY_S },
	},
	[QUEUE_NAMES.storage]: {
		attempts: 5,
		backoff: { type: "exponential", delay: 30_000 },
		removeOnComplete: { age: DAY_S },
		removeOnFail: { age: 14 * DAY_S },
	},
	[QUEUE_NAMES.maintenance]: {
		attempts: 2,
		backoff: { type: "fixed", delay: 60_000 },
		removeOnComplete: { age: DAY_S },
		removeOnFail: { age: 7 * DAY_S },
	},
};

/** Va tras `REDIS_KEY_PREFIX`: las claves de las colas quedan en `idc:bull:*`. */
export const QUEUE_PREFIX_SUFFIX = "bull";

export const OUTBOX_SWEEP_EVERY_MS = 60_000;
export const OUTBOX_SWEEP_BATCH = 500;

/** Ediciones seguidas del mismo curso se juntan en un solo recálculo. */
export const PROGRESS_RECALC_DELAY_MS = 2_000;

export const JOB_FAILURE_RETENTION_DAYS = 30;

export const MAINTENANCE_TIMEZONE = "America/Tijuana";

export const MAINTENANCE_SCHEDULES = [
	{ name: JOB_NAMES.purgeExpiredSessions, pattern: "0 3 * * *" },
	{ name: JOB_NAMES.purgeSentEmails, pattern: "15 3 * * *" },
	{ name: JOB_NAMES.purgeJobFailures, pattern: "30 3 * * *" },
] as const;
