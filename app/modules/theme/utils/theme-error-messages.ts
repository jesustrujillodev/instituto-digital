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
