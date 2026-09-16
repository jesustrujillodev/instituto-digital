import * as v from "valibot";
import { isDomainError } from "@/shared/errors/domain-error";
import { toFieldErrors } from "@/shared/rules/format-vali-error";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import type {
	AppResponse,
	FailResponse,
	OkResponse,
	PaginationInput,
	PaginationMeta,
	ResponseError,
} from "./response.types";

// ===============================================================
// Constructores del envelope
// ===============================================================
// Se usan en TODAS las capas que producen una respuesta: los servicios de
// application/, y los loaders y actions. Nadie escribe el literal a mano — el
// `timestamp` se olvidaría y `success` acabaría siendo un boolean suelto.

const now = () => new Date().toISOString();

/**
 * Respuesta correcta.
 *
 * @example ok(user)
 * @example ok(users, { pagination: toPaginationMeta({ page, pageSize, total }) })
 * @example ok(null, { message: "Usuario archivado" })
 */
export const ok = <T>(
	data: T,
	extra?: { message?: string; pagination?: PaginationMeta },
): OkResponse<T> => ({
	success: true,
	data,
	...(extra?.message !== undefined && { message: extra.message }),
	...(extra?.pagination !== undefined && { pagination: extra.pagination }),
	timestamp: now(),
});

/**
 * Respuesta fallida a partir de un error ya normalizado.
 *
 * Para un `unknown` capturado, usa `toResponseError` antes (o deja que lo haga
 * `createOperationRunner`).
 */
export const fail = (error: ResponseError): FailResponse => ({
	success: false,
	error,
	timestamp: now(),
});

// ── Guardas ───────────────────────────────────────────────────────────────────
// `response.success` ya estrecha por sí solo; estos predicados existen para
// usarse como callbacks (filter, every) sin escribir una lambda.

export const isOk = <T>(response: AppResponse<T>): response is OkResponse<T> =>
	response.success;

export const isFail = <T>(response: AppResponse<T>): response is FailResponse =>
	!response.success;

// ── Paginación ────────────────────────────────────────────────────────────────

/**
 * Deriva la metadata de paginación de la página pedida y el total sin paginar.
 *
 * `totalPages` es siempre >= 1: una lista vacía sigue teniendo una página (la
 * que se está mostrando), y devolver 0 rompería los controles de la tabla.
 */
export const toPaginationMeta = ({
	page,
	pageSize,
	total,
}: PaginationInput): PaginationMeta => ({
	page,
	pageSize,
	total,
	totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

// ===============================================================
// Normalización de errores
// ===============================================================

/**
 * Convierte cualquier error capturado en el error tipado del envelope.
 *
 * Regla de seguridad: solo los errores CONOCIDOS conservan su código y su
 * mensaje. Un error sin tipar puede traer una consulta SQL, una ruta del sistema
 * de archivos o un secreto en el mensaje, así que se sustituye por
 * `UNEXPECTED_ERROR`. El mensaje original se registra en el log, no se devuelve.
 */
export const toResponseError = (error: unknown): ResponseError => {
	if (v.isValiError(error)) {
		return {
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Validation failed",
			fieldErrors: toFieldErrors(error.issues),
		};
	}

	if (isDomainError(error)) {
		return {
			code: error.code,
			message: error.message,
			...(error.details && { details: error.details }),
		};
	}

	return {
		code: RESPONSE_ERROR_CODES.UNEXPECTED,
		message: "Unexpected error",
	};
};

/** `true` si el error no pudo tiparse y por tanto merece log de nivel error. */
export const isUnexpected = (error: ResponseError): boolean =>
	error.code === RESPONSE_ERROR_CODES.UNEXPECTED;

/**
 * Mete la validación de frontera dentro del envelope.
 *
 * Es el equivalente de `createOperationRunner` para el adaptador: los
 * validadores lanzan `ValiError`, y esta es la única forma de que ese throw no
 * se cuele en un action que por contrato devuelve `AppResponse`. Se valida todo
 * lo del envío de una vez para no encadenar tres `try` seguidos.
 *
 * @example
 * const input = parseInput(() => ({
 *   documentId: validateFindUser({ documentId: params.documentId }).documentId,
 *   dto: validateUpdateUser(fields),
 * }));
 * if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);
 */
export const parseInput = <T>(parse: () => T): AppResponse<T> => {
	try {
		return ok(parse());
	} catch (error) {
		return fail(toResponseError(error));
	}
};
