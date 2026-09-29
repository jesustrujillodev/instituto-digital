import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { ENROLLMENT_QR_ERROR_CODES } from "../domain/enrollment-qr.errors";

export const ENROLLMENT_QR_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Este código de inscripción no es válido.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[ENROLLMENT_QR_ERROR_CODES.INVALID_TOKEN]: {
		message:
			"Este código de inscripción no es válido o fue reemplazado. Busca el curso en «Cursos disponibles».",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[ENROLLMENT_QR_ERROR_CODES.UNAVAILABLE]: {
		message: "Este curso ya no recibe inscripciones por código QR.",
		status: HTTP_STATUS.CONFLICT,
	},
	[ENROLLMENT_QR_ERROR_CODES.NOT_IN_AUDIENCE]: {
		message: "Este curso no está dirigido a tu dependencia ni a tus grupos.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[ENROLLMENT_QR_ERROR_CODES.RATE_LIMITED]: {
		message: "Demasiados intentos. Espera un momento y vuelve a escanear.",
		status: HTTP_STATUS.TOO_MANY_REQUESTS,
	},
	[ENROLLMENT_QR_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No administras el código QR de inscripción de este curso.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
