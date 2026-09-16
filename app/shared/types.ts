/**
 * Estado que el middleware de root.tsx comparte con `configureContainer`.
 *
 * No es una respuesta ni un DTO: es el canal por el que el refresco silencioso
 * de tokens le pide al middleware que añada cookies o redirija a login.
 *
 * El contrato de respuestas de servicios, loaders y actions NO vive aquí —
 * está en shared/response/response.types.ts y shared/rules/response.rules.ts.
 */
export interface ApiContext {
	shouldRedirectToLogin?: boolean;
	newCookies?: string[];
}
