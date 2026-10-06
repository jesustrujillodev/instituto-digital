import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import type { ResponseError } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { CONTENT_ERROR_CODES } from "../domain/content.errors";

const limitOf = (error: ResponseError): number | null => {
	const limit = (error.details as { limit?: unknown } | undefined)?.limit;

	return typeof limit === "number" ? limit : null;
};

const VALIDATION_FALLBACK = "Revisa los datos del temario antes de guardar.";

/**
 * El primer problema concreto de la validación, en vez de un aviso genérico:
 * los paneles del temario solo enseñan el mensaje, no marcan campos. En un
 * cuestionario se dice además de qué pregunta se trata.
 */
export const validationMessageOf = (error: ResponseError): string => {
	const [entry] = Object.entries(error.fieldErrors ?? {});
	if (!entry) return VALIDATION_FALLBACK;

	const [path, message] = entry;
	const question = /^questions\.(\d+)\./.exec(path);

	return question ? `Pregunta ${Number(question[1]) + 1}: ${message}` : message;
};

export const CONTENT_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: validationMessageOf,
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CONTENT_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "La capacitación no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.COURSE_NOT_EDITABLE]: {
		message: "Esta capacitación ya no admite cambios en su temario.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.DELETE_LOCKED]: {
		message:
			"La capacitación ya está publicada: sus módulos y lecciones se editan o se agregan, pero ya no se eliminan.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.MODULE_NOT_FOUND]: {
		message: "El módulo ya no existe. Vuelve a cargar la página.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.LESSON_NOT_FOUND]: {
		message: "La lección ya no existe. Vuelve a cargar la página.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.TOO_MANY_MODULES]: {
		message: (error) => {
			const limit = limitOf(error);

			return limit === null
				? "Esta capacitación ya llegó al máximo de módulos."
				: `Esta capacitación ya tiene los ${limit} módulos permitidos.`;
		},
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.TOO_MANY_LESSONS]: {
		message: (error) => {
			const limit = limitOf(error);

			return limit === null
				? "Este módulo ya llegó al máximo de lecciones."
				: `Este módulo ya tiene las ${limit} lecciones permitidas.`;
		},
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.MODULE_NOT_EMPTY]: {
		message:
			"Elimina primero sus lecciones: un módulo con lecciones activas no se puede eliminar.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.MODULE_HAS_QUIZ]: {
		message:
			"Elimina primero su cuestionario: un módulo con evaluación activa no se puede eliminar.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.INVALID_ORDER]: {
		message:
			"El orden ya no coincide con lo que hay guardado. Vuelve a cargar la página.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.MATERIAL_MISMATCH]: {
		message:
			"El material no corresponde a la clase de la lección. Vuelve a cargar la página.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.UPLOAD_INVALID]: {
		message: "Ese archivo no se puede subir: revisa su formato y su tamaño.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CONTENT_ERROR_CODES.UPLOAD_NOT_FOUND]: {
		message: "La subida no llegó a completarse. Inténtalo de nuevo.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.UPLOAD_TOO_LARGE]: {
		message: (error) => {
			const limit = limitOf(error);

			return limit === null
				? "El archivo supera el tamaño permitido."
				: `El archivo supera los ${Math.floor(limit / (1024 * 1024))} MB permitidos.`;
		},
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CONTENT_ERROR_CODES.LINK_INVALID]: {
		message: "El enlace debe empezar por http:// o https://.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CONTENT_ERROR_CODES.SESSION_NOT_FOUND]: {
		message:
			"Esa sesión ya no existe. Guarda el programa y vuelve a intentarlo.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.SESSION_MATERIAL_NOT_FOUND]: {
		message: "Ese material ya no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.TOO_MANY_SESSION_MATERIALS]: {
		message: (error) =>
			`Una sesión admite como máximo ${Number(error.details?.limit ?? 0)} materiales.`,
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.SESSION_MATERIALS_LOCKED]: {
		message:
			"La capacitación ya terminó o se canceló: su material queda como está.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.NOT_ENROLLED]: {
		message:
			"Solo quien está inscrito a la capacitación puede entrar a su aula.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[CONTENT_ERROR_CODES.CLASSROOM_READ_ONLY]: {
		message:
			"La capacitación ya terminó: puedes repasar sus lecciones, pero ya no se registra avance.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_NOT_FOUND]: {
		message: "Este cuestionario todavía no tiene preguntas.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.QUIZ_LOCKED]: {
		message:
			"Alguien ya presentó este cuestionario: sus preguntas quedaron fijas. Solo se puede cambiar el título.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN]: {
		message: "Ya presentaste este cuestionario: solo hay un intento.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_NOT_AVAILABLE]: {
		message:
			"El examen se habilita cuando completes todas las lecciones obligatorias.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_INCOMPLETE]: {
		message: "Responde todas las preguntas antes de enviar.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CONTENT_ERROR_CODES.QUIZ_NOT_EVALUATED]: {
		message: "Esta capacitación no se evalúa con examen en línea.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_COMPLETES_ON_SUBMIT]: {
		message: "Esta lección se completa al enviar su cuestionario.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED]: {
		message:
			"Solo se habilita otro intento en una capacitación en curso, a quien no lo ha acreditado, cuando el último quedó reprobado, agotó sus intentos y no tiene otro pendiente.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_PARTICIPANT_NOT_FOUND]: {
		message: "Esa persona ya no está inscrita en la capacitación.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.FOLLOW_UP_NOT_FOUND]: {
		message: "Esa evaluación de seguimiento ya no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.FOLLOW_UP_SELF_PACED]: {
		message:
			"Una capacitación autogestiva no tiene evaluaciones de seguimiento: dependen del pase de lista de cada sesión.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.TOO_MANY_FOLLOW_UPS]: {
		message: (error) =>
			`Una capacitación tiene como máximo ${String(error.details?.limit ?? "")} evaluaciones de seguimiento.`,
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.FOLLOW_UP_HAS_ATTEMPTS]: {
		message:
			"Alguien ya presentó esta evaluación: sus notas cuentan y no se puede eliminar.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.FOLLOW_UP_NOT_OPEN]: {
		message: "Esta evaluación no está abierta en este momento.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.FOLLOW_UP_NOT_ATTENDED]: {
		message:
			"Para presentar esta evaluación tienes que registrar tu asistencia a la sesión.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.FOLLOW_UP_NOT_MANUAL]: {
		message: "Esta evaluación se abre sola según su sesión, no a mano.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.FOLLOW_UP_CLOSED]: {
		message: "Esta evaluación ya se cerró.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_RATE_LIMITED]: {
		message:
			"Enviaste demasiadas respuestas seguidas. Espera un minuto e inténtalo de nuevo.",
		status: HTTP_STATUS.TOO_MANY_REQUESTS,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
