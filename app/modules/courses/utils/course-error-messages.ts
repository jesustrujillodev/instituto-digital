import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { COURSE_ERROR_CODES } from "../domain/course.errors";

const sessionNumberOf = (error: { details?: Record<string, unknown> }) =>
	Number(error.details?.sessionNumber ?? 0);

/**
 * Copia de usuario por código de error del módulo.
 *
 * `status` solo lo consultan los LOADERS (vía `toRouteError`): un action nunca
 * corta con un status, responde `{ success: false }` para que la pantalla siga
 * en pie.
 */
export const COURSE_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos del formulario.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[COURSE_ERROR_CODES.NOT_FOUND]: {
		message: "El curso ya no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[COURSE_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No puedes administrar cursos.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[COURSE_ERROR_CODES.ORGANIZER_REQUIRED]: {
		message: "Elige la dependencia que organiza el curso.",
		fieldErrors: { dependency: "Elige una dependencia" },
	},
	[COURSE_ERROR_CODES.DEPENDENCY_INACTIVE]:
		"La dependencia organizadora está desactivada y no admite cursos nuevos.",
	[COURSE_ERROR_CODES.NOT_EDITABLE]:
		"Un curso finalizado o cancelado ya no se puede modificar.",
	[COURSE_ERROR_CODES.INVALID_TRANSITION]:
		"El curso ya no está en un estado que permita esta acción.",
	[COURSE_ERROR_CODES.WITHOUT_SESSIONS]:
		"Para publicar, el curso necesita al menos una sesión.",
	[COURSE_ERROR_CODES.WITHOUT_ACTIVE_TRAINER]:
		"Para publicar, el curso necesita al menos un capacitador con el perfil activo.",
	[COURSE_ERROR_CODES.SESSION_MISSING_VENUE]: {
		message: (error) =>
			`La sesión ${sessionNumberOf(error)} no tiene sede, y la modalidad la exige.`,
	},
	[COURSE_ERROR_CODES.SESSION_MISSING_LINK]: {
		message: (error) =>
			`La sesión ${sessionNumberOf(error)} no tiene enlace, y la modalidad lo exige.`,
	},
	[COURSE_ERROR_CODES.SESSION_INVALID_RANGE]: {
		message: (error) =>
			`La sesión ${sessionNumberOf(error)} termina antes de empezar.`,
	},
	[COURSE_ERROR_CODES.TOO_MANY_SESSIONS]: {
		message: (error) =>
			`Un curso admite como máximo ${Number(error.details?.maxSessions ?? 0)} sesiones.`,
	},
	[COURSE_ERROR_CODES.DEADLINE_AFTER_START]: {
		message:
			"La fecha límite de inscripción no puede ser posterior a la primera sesión.",
		fieldErrors: {
			enrollmentDeadline: "Debe ser anterior a la primera sesión",
		},
	},
	[COURSE_ERROR_CODES.AUDIENCE_REQUIRED]:
		"Un curso restringido necesita al menos una dependencia o un grupo.",
	[COURSE_ERROR_CODES.UNKNOWN_TRAINER]:
		"Alguno de los capacitadores elegidos ya no está disponible.",
	[COURSE_ERROR_CODES.UNKNOWN_AUDIENCE]:
		"Alguna de las dependencias o grupos elegidos ya no está disponible.",
	[COURSE_ERROR_CODES.CAPACITY_BELOW_ENROLLED]: {
		message: (error) =>
			`El cupo no puede ser menor que las ${Number(error.details?.enrolled ?? 0)} personas ya inscritas.`,
		fieldErrors: { capacity: "Menor que los inscritos" },
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
