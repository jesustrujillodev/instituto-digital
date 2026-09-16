import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { fail, toResponseError } from "./response.helpers";
import type { FailResponse, ResponseError } from "./response.types";

// ===============================================================
// Traducción de códigos a copia de usuario
// ===============================================================
// El servicio produce códigos estables y mensajes técnicos en inglés; la copia
// que lee una persona es decisión de presentación y vive en el adaptador. Este
// módulo es el puente, y sustituye la escalera de `instanceof` que antes se
// repetía en cada action.

/** Texto por defecto cuando el código no está en el diccionario del módulo. */
export const DEFAULT_ERROR_MESSAGE = "Ha ocurrido un error inesperado.";

export interface ErrorCopy {
	/** Función cuando el texto depende de `error.details` (p. ej. un reintento). */
	message: string | ((error: ResponseError) => string);
	/** Status HTTP cuando el fallo se convierte en error de ruta (loaders). */
	status?: number;
	/**
	 * Errores por campo que el dominio no puede conocer.
	 *
	 * No pisan a los que ya trae el error: los de una validación son más
	 * concretos que los del diccionario.
	 */
	fieldErrors?: Record<string, string>;
}

/**
 * Diccionario `código → copia` de un módulo.
 *
 * La clave `UNEXPECTED_ERROR` define el texto de reserva del módulo; si falta,
 * se usa `DEFAULT_ERROR_MESSAGE`.
 */
export type ErrorMessageMap = Record<string, string | ErrorCopy>;

const normalize = (copy: string | ErrorCopy): ErrorCopy =>
	typeof copy === "string" ? { message: copy } : copy;

/**
 * Busca la copia del código, cayendo al texto de reserva del módulo.
 *
 * Exportada porque `toRouteError` necesita también el `status`, no solo el texto.
 */
export const resolveErrorCopy = (
	error: ResponseError,
	messages: ErrorMessageMap,
): ErrorCopy => {
	const copy =
		messages[error.code] ?? messages[RESPONSE_ERROR_CODES.UNEXPECTED];

	if (!copy) return { message: DEFAULT_ERROR_MESSAGE };

	return normalize(copy);
};

export const resolveErrorMessage = (
	error: ResponseError,
	messages: ErrorMessageMap,
): string => {
	const { message } = resolveErrorCopy(error, messages);

	return typeof message === "function" ? message(error) : message;
};

/**
 * Reescribe un fallo con la copia de usuario del módulo, conservando el código.
 *
 * El `code` NO se traduce: es lo que permite al cliente (y a los tests)
 * distinguir el caso sin comparar strings de UI traducibles.
 *
 * @example
 * const result = await context.userService.archive(documentId);
 * if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);
 */
export const localizeError = (
	response: FailResponse,
	messages: ErrorMessageMap,
): FailResponse => {
	const copy = resolveErrorCopy(response.error, messages);
	const fieldErrors = response.error.fieldErrors ?? copy.fieldErrors;

	return fail({
		...response.error,
		message: resolveErrorMessage(response.error, messages),
		...(fieldErrors && { fieldErrors }),
	});
};

/**
 * Atajo para el error que aún se captura en la frontera: la validación del
 * propio adaptador (params de la URL, campos del FormData), que ocurre ANTES de
 * llamar al servicio y por tanto no pasa por el runner.
 *
 * @example
 * try { dto = validateCreateUser(fields); }
 * catch (error) { return failFrom(error, USER_ERROR_MESSAGES); }
 */
export const failFrom = (
	error: unknown,
	messages: ErrorMessageMap,
): FailResponse => localizeError(fail(toResponseError(error)), messages);
