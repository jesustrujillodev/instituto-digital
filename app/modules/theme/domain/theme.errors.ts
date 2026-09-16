// Errores de dominio del módulo de temas — agnósticos al framework.
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
	NOT_FOUND: "THEME_NOT_FOUND",
	PRESET_IMMUTABLE: "THEME_PRESET_IMMUTABLE",
	ACTIVE_CANNOT_BE_DELETED: "THEME_ACTIVE_CANNOT_BE_DELETED",
	NEVER_PUBLISHED: "THEME_NEVER_PUBLISHED",
	CSS_NOT_PARSEABLE: "THEME_CSS_NOT_PARSEABLE",
} as const;

export abstract class ThemeError extends DomainError {}

/**
 * La preferencia no pudo persistirse en la cuenta.
 *
 * Es un fallo DEGRADADO, no total: la cookie ya se emitió, así que el usuario ve
 * el tema que pidió en este navegador; lo que se pierde es que le siga a otro
 * dispositivo. El adaptador lo refleja con esa copia y no con un error genérico.
 */
export class ThemePreferenceNotSavedError extends ThemeError {
	readonly code = THEME_ERROR_CODES.PREFERENCE_NOT_SAVED;
	constructor() {
		super("Theme preference could not be persisted to the account");
	}
}

/** El tema pedido no existe (o se borró entre la lista y la acción). */
export class ThemeNotFoundError extends ThemeError {
	readonly code = THEME_ERROR_CODES.NOT_FOUND;
	// `details` viaja dentro del envelope: el adaptador puede señalar QUÉ tema
	// falló sin volver a inspeccionar la clase del error.
	readonly details: { documentId: string };

	constructor(documentId: string) {
		super(`Theme ${documentId} not found`);
		this.details = { documentId };
	}
}

/**
 * Se intentó editar, renombrar o borrar un preset de fábrica.
 *
 * Los presets son la red de seguridad de toda la feature: es a lo que se vuelve
 * cuando un tema publicado sale mal. Se clonan, no se tocan.
 */
export class ThemePresetImmutableError extends ThemeError {
	readonly code = THEME_ERROR_CODES.PRESET_IMMUTABLE;
	readonly details: { documentId: string };

	constructor(documentId: string) {
		super(`Theme ${documentId} is a factory preset and cannot be modified`);
		this.details = { documentId };
	}
}

/** Se intentó borrar el tema que la plataforma está sirviendo ahora mismo. */
export class ThemeActiveCannotBeDeletedError extends ThemeError {
	readonly code = THEME_ERROR_CODES.ACTIVE_CANNOT_BE_DELETED;
	readonly details: { documentId: string };

	constructor(documentId: string) {
		super(`Theme ${documentId} is active and cannot be deleted`);
		this.details = { documentId };
	}
}

/**
 * Se intentó activar —o descartar el borrador de— un tema sin publicado.
 *
 * Activarlo dejaría a la app sirviendo tokens en edición; descartar sin
 * publicado no tiene a dónde volver.
 */
export class ThemeNeverPublishedError extends ThemeError {
	readonly code = THEME_ERROR_CODES.NEVER_PUBLISHED;
	readonly details: { documentId: string };

	constructor(documentId: string) {
		super(`Theme ${documentId} has never been published`);
		this.details = { documentId };
	}
}

/** El CSS pegado no contenía un tema reconocible. */
export class ThemeCssNotParseableError extends ThemeError {
	readonly code = THEME_ERROR_CODES.CSS_NOT_PARSEABLE;
	readonly details: { reason: string };

	constructor(reason: string) {
		super(`Pasted CSS could not be read as a theme: ${reason}`);
		this.details = { reason };
	}
}
