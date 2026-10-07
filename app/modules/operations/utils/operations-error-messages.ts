import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";

export const OPERATIONS_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa la pestaña o la página que pediste.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]:
		"No se pudo leer el estado de la operación. Inténtalo de nuevo en unos minutos.",
};
