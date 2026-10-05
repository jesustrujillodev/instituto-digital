import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { TEACHING_ERROR_CODES } from "../domain/teaching.errors";

export const TEACHING_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos enviados.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[TEACHING_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No impartes ni organizas capacitaciones.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[TEACHING_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "La capacitación no existe o no la impartes.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[TEACHING_ERROR_CODES.SESSION_NOT_FOUND]: {
		message: "La sesión no pertenece a esta capacitación.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[TEACHING_ERROR_CODES.SESSION_NOT_STARTED]: {
		message: "Solo se pasa lista a partir del día de la sesión.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.UNKNOWN_PARTICIPANT]: {
		message: "Alguna de las personas ya no está inscrita. Recarga la página.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.CORRECTION_FORBIDDEN]: {
		message:
			"La capacitación ya se finalizó: solo el titular o un auxiliar de la dependencia pueden corregirla.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[TEACHING_ERROR_CODES.NOT_PUBLISHED]: {
		message: "Solo se finaliza una capacitación publicada.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.WITHOUT_SESSIONS]: {
		message: "La capacitación no tiene sesiones.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.FINISH_TOO_EARLY]: {
		message:
			"La capacitación se puede finalizar a partir del día de su última sesión.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.STATE_CHANGED]: {
		message: "La capacitación cambió mientras guardabas. Recarga la página.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.SELF_PACED_NOT_FINISHABLE]: {
		message:
			"Una capacitación autogestiva no se finaliza: cada participante la acredita al cumplir los requisitos. Para dejar de recibir gente, cierra las inscripciones.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.NOT_SELF_PACED]: {
		message:
			"Solo una capacitación autogestiva abre y cierra sus inscripciones a mano; una con sesiones las cierra al empezar.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.CERTIFICATES_NOT_ISSUABLE]: {
		message:
			"Los certificados se emiten al finalizar la capacitación: todavía no se sabe quién la acreditó.",
		status: HTTP_STATUS.CONFLICT,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
