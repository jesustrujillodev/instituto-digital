import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { TRAINER_ERROR_CODES } from "../domain/trainer.errors";

/**
 * Copia de usuario por código de error del módulo.
 *
 * `status` solo lo consultan los LOADERS (vía `toRouteError`): un action nunca
 * corta con un status, responde `{ success: false }` para que la pantalla siga
 * en pie.
 */
export const TRAINER_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos del formulario.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[TRAINER_ERROR_CODES.NOT_FOUND]: {
		message: "Esa persona no tiene perfil de capacitador.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[TRAINER_ERROR_CODES.ALREADY_EXISTS]:
		"Esa persona ya tiene perfil de capacitador.",
	[TRAINER_ERROR_CODES.DUPLICATE_EMAIL]: {
		message: "Ya existe una cuenta con ese correo.",
		fieldErrors: { email: "Ya existe una cuenta con ese correo" },
		status: HTTP_STATUS.CONFLICT,
	},
	[TRAINER_ERROR_CODES.EXTERNAL_REQUIRES_INSTITUTION]: {
		message: "Un capacitador externo tiene que indicar su institución.",
		fieldErrors: { institution: "Indica la institución de procedencia" },
	},
	[TRAINER_ERROR_CODES.INTERNAL_CANNOT_HAVE_INSTITUTION]: {
		message:
			"Un capacitador interno pertenece a una dependencia, no a una institución.",
		fieldErrors: { institution: "No aplica para personal interno" },
	},
	[TRAINER_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No puedes administrar el perfil de esa persona.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
