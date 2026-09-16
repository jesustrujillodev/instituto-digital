import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { AUTH_ERROR_CODES } from "../domain/auth.errors";

/**
 * Copia de usuario del monitor de sesiones.
 *
 * Diccionario PROPIO, deliberadamente separado de `AUTH_ERROR_MESSAGES`. Aquel
 * responde lo mismo a todos los fallos ("Credenciales inválidas") porque su
 * consumidor es el formulario de login y distinguir causas allí lo convierte en
 * un oráculo para enumerar cuentas. Aquí quien lee ya está autenticado y es
 * administrador: esa opacidad no protege nada y solo impediría entender qué
 * pasó.
 *
 * `status` solo lo consultan los LOADERS (vía `toRouteError`); un action nunca
 * corta con status, responde `{ success: false }` para que la pantalla siga en
 * pie.
 */
export const SESSION_MONITOR_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos de la solicitud.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[AUTH_ERROR_CODES.SESSION_NOT_FOUND]: {
		message: "La sesión ya no existe o ya fue cerrada.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[AUTH_ERROR_CODES.INVALID_SESSION]:
		"No se pudo identificar tu sesión actual. Vuelve a iniciar sesión e inténtalo de nuevo.",
	// Aquí sí puede ser explícita: el público es un administrador ya
	// autenticado, no la pantalla de login (docs/auth/02 §B.6).
	[AUTH_ERROR_CODES.PLATFORM_LOCKED]:
		"La plataforma está en lockdown. Esta acción está bloqueada mientras dure el cierre.",
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
