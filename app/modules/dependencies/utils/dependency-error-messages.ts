import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { DEPENDENCY_ERROR_CODES } from "../domain/dependency.errors";

/**
 * Copia de usuario por código de error del módulo.
 *
 * Las claves son los códigos —no las clases—, así que el diccionario no importa
 * nada de la capa de dominio salvo constantes, y añadir un error no obliga a
 * tocar cada action.
 *
 * `status` solo lo consultan los LOADERS (vía `toRouteError`): un action nunca
 * corta con un status, responde `{ success: false }` para que la pantalla siga en
 * pie y pueda mostrar el error junto al campo o en un toast.
 */
export const DEPENDENCY_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos del formulario.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[DEPENDENCY_ERROR_CODES.NOT_FOUND]: {
		message: "La dependencia ya no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[DEPENDENCY_ERROR_CODES.DUPLICATE_NAME]: {
		message: "Ya existe una dependencia con ese nombre.",
		// Lo que el cliente no puede saber por su cuenta se pinta en SU campo, no
		// en un toast genérico.
		fieldErrors: { name: "Ya existe una dependencia con ese nombre" },
		status: HTTP_STATUS.CONFLICT,
	},
	[DEPENDENCY_ERROR_CODES.INACTIVE]:
		"La dependencia está desactivada. Restáurala antes de asignarle titular.",
	// La copia es la razón de ser de la traducción por `meta.target` del
	// repositorio: sin ella, este caso respondía "ese nombre ya existe".
	[DEPENDENCY_ERROR_CODES.ALREADY_HAS_HEAD]:
		"Esa dependencia ya tiene titular. Designar a otro releva al actual.",
	[DEPENDENCY_ERROR_CODES.HEAD_MUST_BELONG]:
		"El titular tiene que pertenecer a la dependencia que administra.",
	[DEPENDENCY_ERROR_CODES.HEAD_MUST_BE_ACTIVE]:
		"No se puede designar titular a una cuenta archivada.",
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
