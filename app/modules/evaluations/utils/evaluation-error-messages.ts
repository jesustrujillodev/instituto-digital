import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { EVALUATION_ERROR_CODES } from "../domain/evaluation.errors";

export const EVALUATION_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa el título y las observaciones antes de guardar.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[EVALUATION_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "El curso no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[EVALUATION_ERROR_CODES.EVALUATION_NOT_FOUND]: {
		message: "La evaluación ya no existe. Vuelve a cargar la página.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[EVALUATION_ERROR_CODES.SESSION_NOT_FOUND]: {
		message: "La sesión elegida no es de este curso.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[EVALUATION_ERROR_CODES.FORBIDDEN]: {
		message:
			"Este curso ya está finalizado: solo el titular o un auxiliar de la dependencia organizadora pueden corregir sus evaluaciones.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[EVALUATION_ERROR_CODES.UNKNOWN_PARTICIPANT]: {
		message:
			"Alguien de la lista ya no está inscrito. Vuelve a cargar la página.",
		status: HTTP_STATUS.CONFLICT,
	},
	[EVALUATION_ERROR_CODES.SELF_PACED]: {
		message:
			"Un curso autogestivo no tiene evaluaciones de seguimiento: no hay capacitador que las capture.",
		status: HTTP_STATUS.CONFLICT,
	},
	[EVALUATION_ERROR_CODES.TOO_MANY]: {
		message: "Este curso ya llegó al máximo de evaluaciones.",
		status: HTTP_STATUS.CONFLICT,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
