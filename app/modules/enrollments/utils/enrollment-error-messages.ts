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
		message: "La capacitación no existe o no está disponible para ti.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[ENROLLMENT_ERROR_CODES.NOT_ELIGIBLE]: {
		message: "Tu cuenta no puede inscribirse a capacitaciones.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[ENROLLMENT_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No puedes administrar las inscripciones de esta capacitación.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[ENROLLMENT_ERROR_CODES.CLOSED]: {
		message: (error) => {
			const closesAt = error.details?.closesAt;
			return typeof closesAt === "string"
				? `La inscripción cerró el ${formatZonedDate(new Date(closesAt))}.`
				: "La inscripción a esta capacitación está cerrada.";
		},
	},
	[ENROLLMENT_ERROR_CODES.FULL]: {
		message: (error) => {
			const seatsLeft = Number(error.details?.seatsLeft ?? 0);
			return seatsLeft === 0
				? "La capacitación ya no tiene lugares disponibles."
				: `Solo quedan ${seatsLeft} lugares: elige a menos personas.`;
		},
	},
	[ENROLLMENT_ERROR_CODES.ALREADY_ENROLLED]:
		"Ya estás inscrito a esta capacitación.",
	[ENROLLMENT_ERROR_CODES.NOT_ENROLLED]:
		"No estás inscrito a esta capacitación.",
	[ENROLLMENT_ERROR_CODES.WITHDRAW_CLOSED]:
		"La capacitación ya empezó: la baja voluntaria ya no está disponible.",
	[ENROLLMENT_ERROR_CODES.INVITATION_NOT_FOUND]:
		"No tienes una invitación pendiente a esta capacitación.",
	[ENROLLMENT_ERROR_CODES.UNKNOWN_PARTICIPANT]:
		"Alguna de las personas elegidas no está disponible para esta capacitación.",
	[ENROLLMENT_ERROR_CODES.UNKNOWN_GROUP]:
		"Alguno de los grupos elegidos ya no está disponible.",
	[ENROLLMENT_ERROR_CODES.INVITATIONS_DISABLED]:
		"Esta capacitación no es por invitación: inscribe a las personas directamente.",
	[ENROLLMENT_ERROR_CODES.INVITATION_REQUIRED]:
		"Esta capacitación es por invitación: solo se inscribe quien fue invitado.",
	[ENROLLMENT_ERROR_CODES.STATE_CHANGED]:
		"La inscripción cambió mientras se procesaba. Recarga e inténtalo de nuevo.",
	[ENROLLMENT_ERROR_CODES.REMOVED]:
		"Quien organiza la capacitación te dio de baja: solo esa persona puede volver a inscribirte.",
	[ENROLLMENT_ERROR_CODES.PARTICIPANT_NOT_ENROLLED]:
		"Esa persona ya no está inscrita en la capacitación.",
	[ENROLLMENT_ERROR_CODES.REMOVE_CLOSED]: {
		message: (error) =>
			error.details?.reason === "COMPLETED"
				? "Esa persona ya completó la capacitación: no se puede dar de baja."
				: "Solo se da de baja en una capacitación publicada.",
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
