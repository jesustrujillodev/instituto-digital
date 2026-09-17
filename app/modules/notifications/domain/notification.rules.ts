import {
	LAST_ERROR_MAX_LENGTH,
	RETRY_DELAYS_MIN,
	SENT_RETENTION_DAYS,
} from "./notification.config";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Cuándo reintentar tras fallar el intento número `attempts` (1, 2…). `null`
 * cuando ya no quedan reintentos y el mensaje debe quedar `FAILED`.
 */
export const nextAttemptAfter = (attempts: number, now: Date): Date | null => {
	const delay = RETRY_DELAYS_MIN[attempts - 1];
	return delay === undefined
		? null
		: new Date(now.getTime() + delay * MINUTE_MS);
};

export const purgeCutoff = (now: Date): Date =>
	new Date(now.getTime() - SENT_RETENTION_DAYS * DAY_MS);

/**
 * El error que se guarda. Recortado, y sin el stack: un error de SMTP puede
 * traer la conversación con el servidor, que no aporta y sí ocupa.
 */
export const describeSendError = (error: unknown): string => {
	const message = error instanceof Error ? error.message : String(error);
	return message.slice(0, LAST_ERROR_MAX_LENGTH);
};
