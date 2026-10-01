import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { RATING_ERROR_CODES } from "../domain/rating.errors";

export const RATING_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Elige una puntuación de 1 a 5.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[RATING_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "La capacitación no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[RATING_ERROR_CODES.NOT_ELIGIBLE]: {
		message:
			"Solo valoran la capacitación quienes estuvieron inscritos y asistieron, una vez finalizada.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[RATING_ERROR_CODES.ALREADY_RATED]: {
		message: "Ya valoraste esta capacitación.",
		status: HTTP_STATUS.CONFLICT,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
