import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { ANNUAL_PLAN_ERROR_CODES } from "../domain/annual-plan.errors";

/**
 * Se reutiliza en el alta de cursos: "Crear curso desde esta línea" falla con
 * los mismos códigos que el plan.
 */
export const ANNUAL_PLAN_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos de la línea.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[ANNUAL_PLAN_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message:
			"Solo el titular y los auxiliares gestionan el plan de su dependencia.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[ANNUAL_PLAN_ERROR_CODES.NOT_FOUND]: {
		message: "El plan no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[ANNUAL_PLAN_ERROR_CODES.LINE_NOT_FOUND]: {
		message: "La línea del plan no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[ANNUAL_PLAN_ERROR_CODES.ALREADY_EXISTS]: {
		message: (error) =>
			`Tu dependencia ya tiene el plan ${String(error.details?.fiscalYear ?? "de ese ejercicio")}.`,
		status: HTTP_STATUS.CONFLICT,
	},
	[ANNUAL_PLAN_ERROR_CODES.INVALID_YEAR]: {
		message: "Solo se crea el plan del ejercicio actual o del siguiente.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[ANNUAL_PLAN_ERROR_CODES.READ_ONLY]: {
		message: "Los planes de ejercicios anteriores son de solo lectura.",
		status: HTTP_STATUS.CONFLICT,
	},
	[ANNUAL_PLAN_ERROR_CODES.LINE_CANCELLED]: {
		message: "La línea está cancelada. Reactívala primero.",
		status: HTTP_STATUS.CONFLICT,
	},
	[ANNUAL_PLAN_ERROR_CODES.LINE_NOT_CANCELLED]: {
		message: "La línea no está cancelada.",
		status: HTTP_STATUS.CONFLICT,
	},
	[ANNUAL_PLAN_ERROR_CODES.LINE_HAS_ACTIVE_COURSE]: {
		message:
			"La línea ya tiene un curso vigente. Cancela el curso para liberarla.",
		status: HTTP_STATUS.CONFLICT,
	},
	[ANNUAL_PLAN_ERROR_CODES.LINE_HAS_COURSES]: {
		message:
			"La línea tuvo cursos y conserva ese historial: cancélala en lugar de borrarla.",
		status: HTTP_STATUS.CONFLICT,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
