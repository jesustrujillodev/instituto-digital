import { HTTP_STATUS } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { USER_ERROR_CODES } from "../domain/user.errors";

/**
 * Copia de usuario por código de error del módulo.
 *
 * Sustituye la escalera de `instanceof` que antes se repetía en los tres actions
 * del módulo: añadir un error de dominio ya no obliga a tocar cada action, solo
 * esta tabla. Y como las claves son los códigos —no las clases— el diccionario
 * no importa nada de la capa de dominio salvo constantes.
 *
 * `status` solo lo consultan los LOADERS (vía `toRouteError`): un action nunca
 * corta con un status, responde `{ success: false }` para que la pantalla siga
 * en pie y pueda mostrar el error junto al campo o en un toast.
 */
export const USER_ERROR_MESSAGES: ErrorMessageMap = {
	[RESPONSE_ERROR_CODES.VALIDATION]: {
		message: "Revisa los datos del formulario.",
		status: HTTP_STATUS.BAD_REQUEST,
	},
	[USER_ERROR_CODES.NOT_FOUND]: {
		message: "El usuario ya no existe.",
		status: HTTP_STATUS.NOT_FOUND,
	},
	[USER_ERROR_CODES.DUPLICATE_EMAIL]: {
		message: "Ese correo ya está registrado.",
		// Lo que el cliente no puede saber por su cuenta se pinta en SU campo, no
		// en un toast genérico.
		fieldErrors: { email: "Ese correo ya está registrado" },
		status: HTTP_STATUS.CONFLICT,
	},
	[USER_ERROR_CODES.DUPLICATE_EMPLOYEE_NUMBER]: {
		message: "Ese número de empleado ya está registrado.",
		// La razón de ser de distinguir el P2002 por `meta.target`: antes esto
		// respondía "ese correo ya está registrado" y mandaba a corregir otro campo.
		fieldErrors: {
			employeeNumber: "Ese número de empleado ya está registrado",
		},
		status: HTTP_STATUS.CONFLICT,
	},
	[USER_ERROR_CODES.EMPLOYEE_NUMBER_REQUIRED]: {
		message: "El personal interno necesita número de empleado.",
		fieldErrors: {
			employeeNumber: "El personal interno necesita número de empleado",
		},
	},
	[USER_ERROR_CODES.DEPENDENCY_NOT_FOUND]: {
		message: "La dependencia elegida ya no existe.",
		fieldErrors: { dependency: "Elige una dependencia válida" },
	},
	[USER_ERROR_CODES.DEPENDENCY_INACTIVE]: {
		message: "Esa dependencia está desactivada y no admite personal nuevo.",
		fieldErrors: { dependency: "Esa dependencia está desactivada" },
	},
	[USER_ERROR_CODES.HEAD_CANNOT_LEAVE]:
		"Un titular no puede cambiar de dependencia mientras lo sea. Pide al superadministrador que designe a otra persona antes.",
	// Aquí SÍ se dice que falta permiso, a diferencia de una lectura fuera de
	// alcance: el actor ya conoce el recurso y lo que intenta es otorgarse o
	// otorgar algo por encima de su rango. Un 404 le haría buscar otro problema.
	[USER_ERROR_CODES.FORBIDDEN_SCOPE]: {
		message: "No tienes permiso para hacer eso sobre esta cuenta.",
		status: HTTP_STATUS.FORBIDDEN,
	},
	[USER_ERROR_CODES.INVALID_CURRENT_PASSWORD]: {
		message: "La contraseña actual no es correcta.",
		fieldErrors: { currentPassword: "La contraseña actual no es correcta" },
	},
	[USER_ERROR_CODES.NOT_ARCHIVED]:
		"Archiva el usuario antes de eliminarlo permanentemente.",
	[USER_ERROR_CODES.HAS_RELATED_RECORDS]:
		"No se puede eliminar: el usuario tiene registros asociados. Puedes dejarlo archivado.",
	[USER_ERROR_CODES.INVALID_UPLOAD]: "La imagen seleccionada no es válida.",
	// El alta de externos vive en el catálogo de capacitadores, que crea cuenta y
	// perfil en la misma transacción: aquí no hay forma de cumplir §4 del alcance.
	[USER_ERROR_CODES.EXTERNAL_REQUIRES_TRAINER]:
		"Los capacitadores externos se registran desde el catálogo de capacitadores.",
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Ha ocurrido un error inesperado.",
};
