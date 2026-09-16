import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { GROUP_ERROR_CODES } from "../domain/group.errors";

/**
 * Copia de usuario por código de error del módulo.
 *
 * `status` solo lo consultan los LOADERS (vía `toRouteError`): un action nunca
 * corta con un status, responde `{ success: false }` para que la pantalla siga
 * en pie.
 */
export const GROUP_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos del formulario.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[GROUP_ERROR_CODES.NOT_FOUND]: {
		message: "El grupo ya no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[GROUP_ERROR_CODES.DUPLICATE_NAME]: {
		message: "Ya existe un grupo activo con ese nombre en tu dependencia.",
		fieldErrors: { name: "Ya existe un grupo con ese nombre" },
		status: HTTP_STATUS.CONFLICT,
	},
	[GROUP_ERROR_CODES.DEPENDENCY_INACTIVE]:
		"Tu dependencia está desactivada y no admite grupos nuevos.",
	[GROUP_ERROR_CODES.MEMBER_OUT_OF_DEPENDENCY]:
		"Solo puedes agregar personal interno y activo de la dependencia del grupo.",
	[GROUP_ERROR_CODES.EXTERNAL_CANNOT_JOIN]:
		"Una cuenta externa no puede pertenecer a un grupo.",
	[GROUP_ERROR_CODES.MEMBER_ALREADY_IN_GROUP]:
		"Esa persona ya pertenece al grupo.",
	[GROUP_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "Los grupos los administra la dependencia a la que pertenecen.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
