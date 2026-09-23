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
		message: "No impartes ni organizas cursos.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[TEACHING_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "El curso no existe o no lo impartes.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[TEACHING_ERROR_CODES.SESSION_NOT_FOUND]: {
		message: "La sesión no pertenece a este curso.",
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
	[TEACHING_ERROR_CODES.EVALUATION_NOT_REQUIRED]: {
		message: "Este curso no requiere evaluación.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.CORRECTION_FORBIDDEN]: {
		message:
			"El curso ya se finalizó: solo el titular o un auxiliar de la dependencia pueden corregirlo.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[TEACHING_ERROR_CODES.NOT_PUBLISHED]: {
		message: "Solo se finaliza un curso publicado.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.WITHOUT_SESSIONS]: {
		message: "El curso no tiene sesiones.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.FINISH_TOO_EARLY]: {
		message:
			"El curso se puede finalizar a partir del día de su última sesión.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.PENDING_RESULTS]: {
		message: (error) =>
			`Falta capturar el resultado de ${String(error.details?.pending ?? "algunas")} persona(s).`,
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.STATE_CHANGED]: {
		message: "El curso cambió mientras guardabas. Recarga la página.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.SELF_PACED_NOT_FINISHABLE]: {
		message:
			"Un curso autogestivo no se finaliza: cada participante lo completa al terminarlo. Para dejar de recibir gente, cierra las inscripciones.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.NOT_SELF_PACED]: {
		message:
			"Solo un curso autogestivo abre y cierra sus inscripciones a mano; uno con sesiones las cierra al empezar.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.CERTIFICATES_NOT_ISSUABLE]: {
		message:
			"Los certificados se emiten al finalizar el curso: todavía no se sabe quién lo completó.",
		status: HTTP_STATUS.CONFLICT,
	},
	[TEACHING_ERROR_CODES.RESULTS_BY_QUIZ]: {
		message:
			"Este curso se evalúa con examen en línea: el resultado lo escribe el examen, no se captura a mano.",
		status: HTTP_STATUS.CONFLICT,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
