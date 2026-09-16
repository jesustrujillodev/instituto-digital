import { describe, expect, test } from "vitest";
import { resolveErrorMessage } from "@/shared/response/response.messages";
import type { ResponseError } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { AUTH_ERROR_CODES } from "../../domain/auth.errors";
import { AUTH_ERROR_MESSAGES } from "../auth-error-messages";

const copyFor = (code: string, details?: Record<string, unknown>) =>
	resolveErrorMessage(
		{ code, message: "técnico", ...(details && { details }) } as ResponseError,
		AUTH_ERROR_MESSAGES,
	);

describe("AUTH_ERROR_MESSAGES — account enumeration", () => {
	// LA invariante del diccionario. Si el login distinguiera "ese correo no
	// existe" de "la contraseña no coincide", el formulario se convierte en un
	// oráculo para enumerar cuentas: se prueba una lista de correos y se lee la
	// diferencia. Los cinco fallos comparten literalmente el mismo texto.
	test("every credential and session failure yields the SAME copy", () => {
		const codes = [
			RESPONSE_ERROR_CODES.VALIDATION,
			AUTH_ERROR_CODES.INVALID_CREDENTIALS,
			AUTH_ERROR_CODES.INVALID_SESSION,
			AUTH_ERROR_CODES.SESSION_EXPIRED,
			AUTH_ERROR_CODES.TOKEN_REUSE,
		];

		const copies = new Set(codes.map((code) => copyFor(code)));

		expect(copies.size).toBe(1);
		expect([...copies][0]).toBe("Credenciales inválidas.");
	});

	// La validación tampoco detalla: el mensaje de valibot decía qué campo
	// incumplía qué regla, y eso también es información de más en el login.
	test("validation does not reveal which field failed", () => {
		expect(copyFor(RESPONSE_ERROR_CODES.VALIDATION)).toBe(
			"Credenciales inválidas.",
		);
	});
});

describe("AUTH_ERROR_MESSAGES — platform locked", () => {
	// Genérico a propósito: no dice "incidente de seguridad" ni da un plazo, y
	// `lockdownReason` nunca viaja al cliente.
	test("says nothing about an incident, a reason or a deadline", () => {
		const copy = copyFor(AUTH_ERROR_CODES.PLATFORM_LOCKED);

		expect(copy).toBe(
			"El acceso está temporalmente suspendido. Inténtalo más tarde.",
		);
		expect(copy.toLowerCase()).not.toContain("incidente");
		expect(copy.toLowerCase()).not.toContain("lockdown");
		expect(copy.toLowerCase()).not.toContain("seguridad");
	});

	// Y no se confunde con el resto: quien queda fuera por el cierre no debe leer
	// "credenciales inválidas" y ponerse a resetear su contraseña.
	test("is distinct from the credentials copy", () => {
		expect(copyFor(AUTH_ERROR_CODES.PLATFORM_LOCKED)).not.toBe(
			copyFor(AUTH_ERROR_CODES.INVALID_CREDENTIALS),
		);
	});
});

describe("AUTH_ERROR_MESSAGES — too many attempts", () => {
	// El único con texto propio: aquí el detalle sí ayuda a quien espera, y no
	// revela nada que el rate limiter no haya revelado ya al bloquear.
	test("interpolates the wait from details", () => {
		expect(
			copyFor(AUTH_ERROR_CODES.TOO_MANY_ATTEMPTS, { retryAfterMs: 30_000 }),
		).toBe("Demasiados intentos. Intenta de nuevo en 30 segundos.");
	});

	// Redondea hacia ARRIBA: decir "en 4 segundos" cuando faltan 4,2 hace que el
	// reintento vuelva a fallar.
	test("rounds the wait up, never down", () => {
		expect(
			copyFor(AUTH_ERROR_CODES.TOO_MANY_ATTEMPTS, { retryAfterMs: 4200 }),
		).toBe("Demasiados intentos. Intenta de nuevo en 5 segundos.");
	});

	test("survives a missing retryAfterMs", () => {
		expect(copyFor(AUTH_ERROR_CODES.TOO_MANY_ATTEMPTS)).toBe(
			"Demasiados intentos. Intenta de nuevo en 0 segundos.",
		);
	});
});

describe("AUTH_ERROR_MESSAGES — coverage of the dictionary", () => {
	// Sin entrada de reserva, un código nuevo caería al default global y el
	// módulo perdería el control de su propia copia.
	test("declares the UNEXPECTED fallback", () => {
		expect(AUTH_ERROR_MESSAGES[RESPONSE_ERROR_CODES.UNEXPECTED]).toBe(
			"Ha ocurrido un error inesperado.",
		);
	});

	test("an unknown code falls back to the module copy", () => {
		expect(copyFor("CODIGO_QUE_NO_EXISTE")).toBe(
			"Ha ocurrido un error inesperado.",
		);
	});

	// Los códigos que el login/refresh puede producir tienen que estar todos: uno
	// sin entrada se degrada silenciosamente al texto de reserva.
	test("covers every auth code reachable from login and refresh", () => {
		const reachable = [
			AUTH_ERROR_CODES.INVALID_CREDENTIALS,
			AUTH_ERROR_CODES.INVALID_SESSION,
			AUTH_ERROR_CODES.SESSION_EXPIRED,
			AUTH_ERROR_CODES.TOKEN_REUSE,
			AUTH_ERROR_CODES.TOO_MANY_ATTEMPTS,
			AUTH_ERROR_CODES.PLATFORM_LOCKED,
		];

		for (const code of reachable) {
			expect(AUTH_ERROR_MESSAGES[code]).toBeDefined();
		}
	});

	// Ninguna copia debe filtrar el mensaje técnico ni un detalle de
	// infraestructura: son textos fijos escritos a mano.
	test("no copy leaks the technical message", () => {
		for (const code of Object.keys(AUTH_ERROR_MESSAGES)) {
			expect(copyFor(code)).not.toContain("técnico");
		}
	});
});
