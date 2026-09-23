import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import type { ResponseError } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { CONTENT_ERROR_CODES } from "../domain/content.errors";

const limitOf = (error: ResponseError): number | null => {
	const limit = (error.details as { limit?: unknown } | undefined)?.limit;

	return typeof limit === "number" ? limit : null;
};

export const CONTENT_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos del temario antes de guardar.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[CONTENT_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "El curso no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CONTENT_ERROR_CODES.COURSE_NOT_EDITABLE]: {
		message: "Este curso ya no admite cambios en su temario.",
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
				? "Este curso ya llegó al máximo de módulos."
				: `Este curso ya tiene los ${limit} módulos permitidos.`;
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
			"Archiva primero sus lecciones: un módulo con lecciones activas no se archiva.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.MODULE_HAS_QUIZ]: {
		message:
			"Archiva primero su cuestionario: un módulo con evaluación activa no se archiva.",
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
	[CONTENT_ERROR_CODES.NOT_ENROLLED]: {
		message: "Solo quien está inscrito al curso puede entrar a su aula.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[CONTENT_ERROR_CODES.CLASSROOM_READ_ONLY]: {
		message:
			"El curso ya terminó: puedes repasar sus lecciones, pero ya no se registra avance.",
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
		message: "Este curso no se evalúa con examen en línea.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_COMPLETES_ON_SUBMIT]: {
		message: "Esta lección se completa al enviar su cuestionario.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED]: {
		message:
			"Solo se habilita otro intento en un curso en curso, cuando el último quedó reprobado y no hay otro pendiente.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CONTENT_ERROR_CODES.QUIZ_PARTICIPANT_NOT_FOUND]: {
		message: "Esa persona ya no está inscrita en el curso.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
