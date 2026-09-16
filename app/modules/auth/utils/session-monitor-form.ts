import type { AppResponse } from "@/shared/response/response.types";

/** Nombre del campo que transporta la intención de la mutación. */
export const INTENT_FIELD = "intent";

/**
 * Intenciones que acepta el action del monitor.
 *
 * Viajan como un dato más del envío y no como estado mutado antes de enviar:
 * así el comportamiento no depende del orden de los efectos y dos clics
 * seguidos no pueden cruzarse.
 */
export const SESSION_INTENTS = {
	revokeSession: "revoke-session",
	revokeUser: "revoke-user",
	revokeAll: "revoke-all",
	cleanupExpired: "cleanup-expired",
	lockdown: "lockdown",
	lift: "lift",
} as const;

export type SessionIntent =
	(typeof SESSION_INTENTS)[keyof typeof SESSION_INTENTS];

/**
 * Respuesta común de las cuatro intenciones: el envelope estándar sin dato de
 * vuelta — la pantalla revalida el loader en lugar de leer el resultado.
 *
 * Los conteos de las operaciones masivas viajan en `message` y no en `data`
 * para que las cuatro compartan un tipo y el toast no tenga que ramificar por
 * intención.
 */
export type SessionMonitorActionData = AppResponse<null>;
