import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	AUTH_ERROR_CODES,
	AuthError,
	InvalidCredentialsError,
	InvalidSessionError,
	PlatformLockedError,
	SessionExpiredError,
	SessionNotFoundError,
	TokenReuseError,
	TooManyAttemptsError,
} from "../auth.errors";

const ALL_ERRORS = [
	new InvalidCredentialsError(),
	new InvalidSessionError(),
	new SessionExpiredError(),
	new SessionNotFoundError(),
	new TokenReuseError(),
	new PlatformLockedError(),
	new TooManyAttemptsError(5000),
];

describe("AUTH_ERROR_CODES", () => {
	// Son el contrato con el diccionario de copia y con los tests: renombrar uno
	// deja su entrada huérfana y el usuario acabaría viendo el texto de reserva.
	test("keeps its stable values", () => {
		expect(AUTH_ERROR_CODES).toEqual({
			INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
			INVALID_SESSION: "INVALID_SESSION",
			SESSION_EXPIRED: "SESSION_EXPIRED",
			SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
			TOKEN_REUSE: "TOKEN_REUSE",
			TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
			PLATFORM_LOCKED: "PLATFORM_LOCKED",
		});
	});
});

describe("auth errors", () => {
	test("each error carries its own code", () => {
		expect(new InvalidCredentialsError().code).toBe("INVALID_CREDENTIALS");
		expect(new InvalidSessionError().code).toBe("INVALID_SESSION");
		expect(new SessionExpiredError().code).toBe("SESSION_EXPIRED");
		expect(new SessionNotFoundError().code).toBe("SESSION_NOT_FOUND");
		expect(new TokenReuseError().code).toBe("TOKEN_REUSE");
		expect(new PlatformLockedError().code).toBe("PLATFORM_LOCKED");
		expect(new TooManyAttemptsError(0).code).toBe("TOO_MANY_ATTEMPTS");
	});

	// Sin esto, `toResponseError` los trataría como desconocidos y el envelope
	// respondería UNEXPECTED_ERROR: el action no podría distinguir un lockdown de
	// un fallo de base de datos.
	test("every one is an AuthError and a DomainError", () => {
		for (const error of ALL_ERRORS) {
			expect(error).toBeInstanceOf(AuthError);
			expect(isDomainError(error)).toBe(true);
		}
	});

	test("each name matches its concrete class", () => {
		expect(new InvalidCredentialsError().name).toBe("InvalidCredentialsError");
		expect(new PlatformLockedError().name).toBe("PlatformLockedError");
		expect(new TooManyAttemptsError(0).name).toBe("TooManyAttemptsError");
	});

	// SESSION_NOT_FOUND e INVALID_SESSION comparten forma pero no público: uno
	// describe un token que no autentica y el otro un registro ausente en una
	// operación administrativa. Códigos distintos ⇒ copias distintas.
	test("SESSION_NOT_FOUND is not the same code as INVALID_SESSION", () => {
		expect(new SessionNotFoundError().code).not.toBe(
			new InvalidSessionError().code,
		);
	});

	test("no code is accidentally shared between two errors", () => {
		const codes = ALL_ERRORS.map((error) => error.code);

		expect(new Set(codes).size).toBe(codes.length);
	});
});

describe("TooManyAttemptsError", () => {
	// En `details` y no solo como campo de la clase: es lo que hace que el dato
	// sobreviva al paso por el envelope y el diccionario pueda redactar "intenta
	// en N segundos" sin volver a ver la instancia.
	test("carries retryAfterMs inside serialisable details", () => {
		const error = new TooManyAttemptsError(5000);

		expect(error.details).toEqual({ retryAfterMs: 5000 });
		expect(JSON.parse(JSON.stringify(error.details))).toEqual({
			retryAfterMs: 5000,
		});
	});

	test("accepts a zero wait", () => {
		expect(new TooManyAttemptsError(0).details.retryAfterMs).toBe(0);
	});
});

describe("PlatformLockedError", () => {
	// El motivo del cierre (`lockdownReason`) NUNCA viaja: es información
	// operativa y decirle a quien queda fuera que hay un incidente es un regalo.
	test("carries no details at all", () => {
		expect(new PlatformLockedError().details).toBeUndefined();
	});
});
