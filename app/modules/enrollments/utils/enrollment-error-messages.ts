import { formatZonedDate } from "@/lib/date-utils";
import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { ENROLLMENT_ERROR_CODES } from "../domain/enrollment.errors";

/** `status` solo lo usan los loaders; un action responde `{ success: false }`. */
export const ENROLLMENT_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos enviados.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[ENROLLMENT_ERROR_CODES.COURSE_NOT_FOUND]: {
		message: "El curso no existe o no está disponible para ti.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[ENROLLMENT_ERROR_CODES.NOT_ELIGIBLE]: {
		message: "Tu cuenta no puede inscribirse a cursos.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[ENROLLMENT_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No puedes administrar las inscripciones de este curso.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[ENROLLMENT_ERROR_CODES.CLOSED]: {
		message: (error) => {
			const closesAt = error.details?.closesAt;
			return typeof closesAt === "string"
				? `La inscripción cerró el ${formatZonedDate(new Date(closesAt))}.`
				: "La inscripción a este curso está cerrada.";
		},
	},
	[ENROLLMENT_ERROR_CODES.FULL]: {
		message: (error) => {
			const seatsLeft = Number(error.details?.seatsLeft ?? 0);
			return seatsLeft === 0
				? "El curso ya no tiene lugares disponibles."
				: `Solo quedan ${seatsLeft} lugares: elige a menos personas.`;
		},
	},
	[ENROLLMENT_ERROR_CODES.ALREADY_ENROLLED]: "Ya estás inscrito a este curso.",
	[ENROLLMENT_ERROR_CODES.NOT_ENROLLED]: "No estás inscrito a este curso.",
	[ENROLLMENT_ERROR_CODES.WITHDRAW_CLOSED]:
		"El curso ya empezó: la baja voluntaria ya no está disponible.",
	[ENROLLMENT_ERROR_CODES.INVITATION_NOT_FOUND]:
		"No tienes una invitación pendiente a este curso.",
	[ENROLLMENT_ERROR_CODES.UNKNOWN_PARTICIPANT]:
		"Alguna de las personas elegidas no está disponible para este curso.",
	[ENROLLMENT_ERROR_CODES.UNKNOWN_GROUP]:
		"Alguno de los grupos elegidos ya no está disponible.",
	[ENROLLMENT_ERROR_CODES.INVITATIONS_DISABLED]:
		"Este curso no es por invitación: inscribe a las personas directamente.",
	[ENROLLMENT_ERROR_CODES.INVITATION_REQUIRED]:
		"Este curso es por invitación: solo se inscribe quien fue invitado.",
	[ENROLLMENT_ERROR_CODES.STATE_CHANGED]:
		"La inscripción cambió mientras se procesaba. Recarga e inténtalo de nuevo.",
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
