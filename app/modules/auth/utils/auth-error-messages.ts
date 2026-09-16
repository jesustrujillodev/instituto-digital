import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { AUTH_ERROR_CODES } from "../domain/auth.errors";

/**
 * Copia de usuario por código de error de auth.
 *
 * Todos los fallos de credenciales, sesión y reuso comparten el MISMO texto a
 * propósito: distinguir "ese correo no existe" de "la contraseña no coincide"
 * convierte el formulario de login en un oráculo para enumerar cuentas.
 *
 * La validación tampoco detalla: el mensaje real de valibot decía qué campo
 * incumplía qué regla, y aquí eso también es información de más.
 */
export const AUTH_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: "Credenciales inválidas.",
	[AUTH_ERROR_CODES.INVALID_CREDENTIALS]: "Credenciales inválidas.",
	[AUTH_ERROR_CODES.INVALID_SESSION]: "Credenciales inválidas.",
	[AUTH_ERROR_CODES.SESSION_EXPIRED]: "Credenciales inválidas.",
	[AUTH_ERROR_CODES.TOKEN_REUSE]: "Credenciales inválidas.",
	// Genérico a propósito (docs/auth/01 §8.4): no dice "incidente de seguridad"
	// ni da plazo. `lockdownReason` nunca viaja al cliente.
	[AUTH_ERROR_CODES.PLATFORM_LOCKED]:
		"El acceso está temporalmente suspendido. Inténtalo más tarde.",
	[AUTH_ERROR_CODES.TOO_MANY_ATTEMPTS]: {
		// El único con texto propio: aquí el detalle sí ayuda a quien espera, y no
		// revela nada que el rate limiter no haya revelado ya al bloquear.
		message: (error) => {
			const retryAfterMs = Number(error.details?.retryAfterMs ?? 0);
			const seconds = Math.ceil(retryAfterMs / 1000);

			return `Demasiados intentos. Intenta de nuevo en ${seconds} segundos.`;
		},
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
