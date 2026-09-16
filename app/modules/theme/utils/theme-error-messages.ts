import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { THEME_ERROR_CODES } from "../domain/theme.errors";

/**
 * Copia de usuario por código de error del módulo.
 *
 * El tono es deliberadamente suave: ninguno de estos fallos impide al usuario
 * seguir trabajando, y el tema que pidió ya se le aplicó en este navegador.
 */
export const THEME_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Ese modo de color no existe.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[THEME_ERROR_CODES.PREFERENCE_NOT_SAVED]:
		"El tema se aplicó en este navegador, pero no pudo guardarse en tu cuenta.",
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};

/**
 * Copia del builder. Va aparte de la anterior porque el público es otro: aquí
 * quien lee es un SUPERADMIN editando la marca de la plataforma, y el mensaje puede
 * explicar la regla en vez de tranquilizar.
 */
export const THEME_BUILDER_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los valores: alguno no es válido.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[THEME_ERROR_CODES.NOT_FOUND]: {
		message: "Ese tema ya no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[THEME_ERROR_CODES.PRESET_IMMUTABLE]: {
		message:
			"Los temas de fábrica no se editan ni se borran. Duplícalo y trabaja sobre la copia.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[THEME_ERROR_CODES.ACTIVE_CANNOT_BE_DELETED]: {
		message:
			"Este es el tema que la plataforma está usando. Activa otro antes de borrarlo.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[THEME_ERROR_CODES.NEVER_PUBLISHED]: {
		message: "Publica el tema antes: todavía no tiene una versión publicada.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[THEME_ERROR_CODES.CSS_NOT_PARSEABLE]: {
		message:
			"Ese CSS no contiene un tema reconocible. Debe traer un bloque :root con al menos background, foreground y primary.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
