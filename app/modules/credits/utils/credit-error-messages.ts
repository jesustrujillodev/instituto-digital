import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { CREDIT_ERROR_CODES } from "../domain/credit.errors";

export const CREDIT_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa el ejercicio o los filtros.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CREDIT_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "Solo puedes consultar tus propios créditos.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[CREDIT_ERROR_CODES.DEPENDENCY_NOT_FOUND]: {
		message: "La dependencia no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
