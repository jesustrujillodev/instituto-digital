import {
	formatSessionRange,
	INSTITUTE_TIME_ZONE_LABEL,
} from "@/lib/date-utils";
import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { CHECK_IN_ERROR_CODES } from "../domain/check-in.errors";

/** "21 sep 2026, 14:30–15:15 (hora de Tijuana)", o null si los ISO no llegaron. */
const windowOf = (
	details: Record<string, unknown> | undefined,
): string | null => {
	const opensAt = new Date(String(details?.opensAt));
	const closesAt = new Date(String(details?.closesAt));

	if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
		return null;
	}

	return `${formatSessionRange(opensAt, closesAt)} (${INSTITUTE_TIME_ZONE_LABEL})`;
};

export const CHECK_IN_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Este código de asistencia no es válido.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CHECK_IN_ERROR_CODES.INVALID_TOKEN]: {
		message:
			"Este código de asistencia no es válido o fue reemplazado. Pide el código vigente a quien imparte el curso.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[CHECK_IN_ERROR_CODES.COURSE_NOT_OPEN]: {
		message: "Este curso no está registrando asistencia.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CHECK_IN_ERROR_CODES.NOT_ENROLLED]: {
		message: "No estás inscrito en este curso.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[CHECK_IN_ERROR_CODES.INVITATION_PENDING]: {
		message:
			"Tienes una invitación pendiente a este curso. Acéptala para poder registrar tu asistencia.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[CHECK_IN_ERROR_CODES.WITHOUT_SESSIONS]: {
		message: "Este curso todavía no tiene sesiones programadas.",
		status: HTTP_STATUS.CONFLICT,
	},
	[CHECK_IN_ERROR_CODES.SESSION_NOT_OPEN]: {
		message: (error) => {
			const window = windowOf(error.details);
			return window
				? `Todavía no abre el registro. Podrás registrar tu asistencia durante todo este rango: ${window}.`
				: "Todavía no abre el registro de la próxima sesión.";
		},
		status: HTTP_STATUS.CONFLICT,
	},
	[CHECK_IN_ERROR_CODES.SESSION_CLOSED]: {
		message: (error) => {
			const window = windowOf(error.details);
			const closed = window
				? `El registro estuvo abierto ${window}.`
				: "El registro de la última sesión ya cerró.";
			return `${closed} Pide a quien imparte el curso que registre tu asistencia.`;
		},
		status: HTTP_STATUS.CONFLICT,
	},
	[CHECK_IN_ERROR_CODES.RATE_LIMITED]: {
		message: "Demasiados intentos. Espera un momento y vuelve a escanear.",
		status: HTTP_STATUS.TOO_MANY_REQUESTS,
	},
	[CHECK_IN_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No administras el código QR de este curso.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
