import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { CALENDAR_ERROR_CODES } from "../domain/calendar.errors";

export const CALENDAR_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los filtros del calendario.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CALENDAR_ERROR_CODES.INVALID_MONTH]: {
		message: "El mes pedido no es válido.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
