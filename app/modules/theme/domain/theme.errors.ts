// Errores de dominio del módulo de apariencia — agnósticos al framework.
// Mismo contrato que users y auth: el caso de uso lanza SOLO estos errores, el
// runner los convierte en el envelope estándar y el adaptador de entrada elige
// la copia de usuario a partir del código.

import { DomainError } from "@/shared/errors/domain-error";

/**
 * Códigos estables del módulo — la clave con la que el adaptador elige la copia
 * de usuario (utils/theme-error-messages.ts).
 */
export const THEME_ERROR_CODES = {
	PREFERENCE_NOT_SAVED: "THEME_PREFERENCE_NOT_SAVED",
} as const;

export abstract class ThemeError extends DomainError {}

/**
 * La preferencia no pudo persistirse en la cuenta.
 *
 * Es un fallo DEGRADADO, no total: la cookie ya se emitió, así que el usuario ve
 * el modo que pidió en este navegador; lo que se pierde es que le siga a otro
 * dispositivo. El adaptador lo refleja con esa copia y no con un error genérico.
 */
export class ThemePreferenceNotSavedError extends ThemeError {
	readonly code = THEME_ERROR_CODES.PREFERENCE_NOT_SAVED;
	constructor() {
		super("Theme preference could not be persisted to the account");
	}
}
