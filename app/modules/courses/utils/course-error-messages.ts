import { ANNUAL_PLAN_ERROR_CODES } from "@/modules/annual-plan/domain/annual-plan.errors";
import { ANNUAL_PLAN_ERROR_MESSAGES } from "@/modules/annual-plan/utils/annual-plan-error-messages";
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
		message: "La capacitación ya no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[COURSE_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No puedes administrar capacitaciones.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[COURSE_ERROR_CODES.ORGANIZER_REQUIRED]: {
		message: "Elige la dependencia que organiza la capacitación.",
		fieldErrors: { dependency: "Elige una dependencia" },
	},
	[COURSE_ERROR_CODES.DEPENDENCY_INACTIVE]:
		"La dependencia organizadora está desactivada y no admite capacitaciones nuevas.",
	[COURSE_ERROR_CODES.NOT_EDITABLE]:
		"Una capacitación finalizada o cancelada ya no se puede modificar.",
	[COURSE_ERROR_CODES.FORMAT_LOCKED]: {
		message:
			"Cómo se imparte la capacitación solo se puede cambiar mientras es borrador.",
		fieldErrors: { format: "No se puede cambiar" },
	},
	[COURSE_ERROR_CODES.INCOMPATIBLE_COMPLETION_RULE]: {
		message:
			"Una capacitación autogestiva no tiene sesiones, así que no puede acreditarse por asistencia.",
		fieldErrors: { completionRule: "Elige otra regla" },
	},
	[COURSE_ERROR_CODES.COMPLETION_LOCKED]: {
		message:
			"La capacitación ya está publicada: la evaluación final y la calificación mínima no se pueden cambiar,ni cómo se acredita una autogestiva.",
		fieldErrors: {
			completionRule: "No se puede cambiar",
			requiresEvaluation: "No se puede cambiar",
		},
	},
	[COURSE_ERROR_CODES.INVALID_TRANSITION]:
		"La capacitación ya no está en un estado que permita esta acción.",
	[COURSE_ERROR_CODES.WITHOUT_SESSIONS]:
		"Una capacitación publicada necesita al menos una sesión.",
	[COURSE_ERROR_CODES.WITHOUT_LESSONS]:
		"Para publicar, una capacitación autogestiva necesita al menos una lección.",
	[COURSE_ERROR_CODES.WITHOUT_QUIZ]:
		"Para publicar, una capacitación con evaluación final necesita un examen con al menos una pregunta.",
	[COURSE_ERROR_CODES.FOLLOW_UP_WITHOUT_QUESTIONS]:
		"Para publicar, cada evaluación de seguimiento necesita al menos una pregunta.",
	[COURSE_ERROR_CODES.SESSION_HAS_ATTEMPTS]:
		"No se puede quitar una sesión cuya evaluación de seguimiento ya presentó alguien.",
	[COURSE_ERROR_CODES.SESSION_HAS_ATTENDANCE]:
		"No se puede quitar una sesión que ya tiene asistencia registrada.",
	[COURSE_ERROR_CODES.STATE_CHANGED]: {
		message:
			"La capacitación cambió de estado mientras se guardaba. Recarga la página para ver cómo quedó.",
		status: HTTP_STATUS.CONFLICT,
	},
	[COURSE_ERROR_CODES.WITHOUT_ACTIVE_TRAINER]:
		"Una capacitación publicada necesita al menos un capacitador con el perfil activo.",
	[COURSE_ERROR_CODES.SESSION_MISSING_VENUE]: {
		message: (error) =>
			`La sesión ${sessionNumberOf(error)} no tiene sede, y la modalidad la exige.`,
	},
	[COURSE_ERROR_CODES.SESSION_MISSING_LINK]: {
		message: (error) =>
			`La sesión ${sessionNumberOf(error)} no tiene enlace, y la modalidad lo exige.`,
	},
	[COURSE_ERROR_CODES.SESSION_MISSING_PLACE]: {
		message: (error) =>
			`La sesión ${sessionNumberOf(error)} no tiene sede ni enlace. En una capacitación híbrida necesita al menos uno.`,
	},
	[COURSE_ERROR_CODES.SESSION_INVALID_RANGE]: {
		message: (error) =>
			`La sesión ${sessionNumberOf(error)} termina antes de empezar.`,
	},
	[COURSE_ERROR_CODES.TOO_MANY_SESSIONS]: {
		message: (error) =>
			`Una capacitación admite como máximo ${Number(error.details?.maxSessions ?? 0)} sesiones.`,
	},
	[COURSE_ERROR_CODES.DEADLINE_AFTER_START]: {
		message:
			"La fecha límite de inscripción no puede ser posterior a la primera sesión.",
		fieldErrors: {
			enrollmentDeadline: "Debe ser anterior a la primera sesión",
		},
	},
	[COURSE_ERROR_CODES.AUDIENCE_REQUIRED]:
		"Una capacitación restringida necesita al menos una dependencia o un grupo.",
	[COURSE_ERROR_CODES.UNKNOWN_TRAINER]:
		"Alguno de los capacitadores elegidos ya no está disponible.",
	[COURSE_ERROR_CODES.UNKNOWN_AUDIENCE]:
		"Alguna de las dependencias o grupos elegidos ya no está disponible.",
	[COURSE_ERROR_CODES.CAPACITY_BELOW_ENROLLED]: {
		message: (error) =>
			`El cupo no puede ser menor que las ${Number(error.details?.enrolled ?? 0)} personas ya inscritas.`,
		fieldErrors: { capacity: "Menor que los inscritos" },
	},
	[COURSE_ERROR_CODES.PLAN_LINE_NOT_FOUND]: {
		message: "La línea del plan no existe o no es de tu dependencia.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[COURSE_ERROR_CODES.PLAN_LINE_LOCKED]: {
		message:
			"El plan anual solo se puede cambiar mientras la capacitación es borrador.",
		fieldErrors: { planLine: "No se puede cambiar" },
	},
	[COURSE_ERROR_CODES.COVER_INVALID]: {
		// El cliente valida lo mismo antes de enviar, así que llegar aquí suele
		// significar un envío a mano: el motivo dice qué tiene de malo el archivo.
		message: (error) =>
			`No se puede usar esa portada: ${String(error.details?.reason ?? "formato no admitido")}.`,
	},
	// Ocupar una línea falla con los códigos del plan.
	...Object.fromEntries(
		[
			ANNUAL_PLAN_ERROR_CODES.LINE_NOT_FOUND,
			ANNUAL_PLAN_ERROR_CODES.FORBIDDEN_SCOPE,
			ANNUAL_PLAN_ERROR_CODES.READ_ONLY,
			ANNUAL_PLAN_ERROR_CODES.LINE_CANCELLED,
			ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE,
		].map((code) => [code, ANNUAL_PLAN_ERROR_MESSAGES[code]]),
	),
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
