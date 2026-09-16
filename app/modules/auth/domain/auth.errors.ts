// Errores de dominio del módulo de auth — agnósticos al framework.
// Los casos de uso lanzan SOLO estos errores; el servicio los convierte en el
// envelope estándar (shared/response) y el adaptador de entrada elige la copia
// de usuario a partir del código (docs/auth/00-sistema-autenticacion.md §9).

import { DomainError } from "@/shared/errors/domain-error";

/** Códigos estables del módulo — claves del diccionario de copia de usuario. */
export const AUTH_ERROR_CODES = {
	INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
	INVALID_SESSION: "INVALID_SESSION",
	SESSION_EXPIRED: "SESSION_EXPIRED",
	SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
	TOKEN_REUSE: "TOKEN_REUSE",
	TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
	PLATFORM_LOCKED: "PLATFORM_LOCKED",
} as const;

export abstract class AuthError extends DomainError {}

export class InvalidCredentialsError extends AuthError {
	readonly code = AUTH_ERROR_CODES.INVALID_CREDENTIALS;
	constructor() {
		super("Invalid credentials");
	}
}

export class InvalidSessionError extends AuthError {
	readonly code = AUTH_ERROR_CODES.INVALID_SESSION;
	constructor() {
		super("Invalid or unknown session");
	}
}

export class SessionExpiredError extends AuthError {
	readonly code = AUTH_ERROR_CODES.SESSION_EXPIRED;
	constructor() {
		super("Session expired");
	}
}

/**
 * La sesión sobre la que se opera desde el monitor ya no existe.
 *
 * Distinto de `InvalidSessionError`: aquel describe un token que no autentica,
 * este un registro ausente en una operación administrativa. Comparten forma
 * pero no público, y por eso no comparten código ni copia.
 */
export class SessionNotFoundError extends AuthError {
	readonly code = AUTH_ERROR_CODES.SESSION_NOT_FOUND;
	constructor() {
		super("Session not found");
	}
}

/** Reuso de un refresh token fuera de la ventana de gracia — robo presunto. */
export class TokenReuseError extends AuthError {
	readonly code = AUTH_ERROR_CODES.TOKEN_REUSE;
	constructor() {
		super("Refresh token reuse detected");
	}
}

/** La plataforma está en lockdown: bloquea login y refresh (docs/auth/02 §B). */
export class PlatformLockedError extends AuthError {
	readonly code = AUTH_ERROR_CODES.PLATFORM_LOCKED;
	constructor() {
		super("Platform is locked down");
	}
}

export class TooManyAttemptsError extends AuthError {
	readonly code = AUTH_ERROR_CODES.TOO_MANY_ATTEMPTS;
	// En `details` y no solo como campo de la clase: así el dato sobrevive al
	// paso por el envelope y el adaptador puede redactar "intenta en N segundos"
	// sin volver a ver la instancia del error.
	readonly details: { retryAfterMs: number };

	constructor(retryAfterMs: number) {
		super("Too many attempts");
		this.details = { retryAfterMs };
	}
}
