import { data, type ErrorResponse, isRouteErrorResponse } from "react-router";
import {
	type ErrorMessageMap,
	resolveErrorCopy,
	resolveErrorMessage,
} from "@/shared/response/response.messages";
import type { ResponseError } from "@/shared/response/response.types";
import type { Role } from "@/shared/rules/atoms.rules";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";

// ── Estados HTTP que la capa de presentación distingue ────────────────────────
export const HTTP_STATUS = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	TOO_MANY_REQUESTS: 429,
	INTERNAL_SERVER_ERROR: 500,
} as const;

// ── Contrato del 403 que lanza requireRole ────────────────────────────────────
export const FORBIDDEN_ROLE_CODE = "FORBIDDEN_ROLE" as const;

export interface ForbiddenRoleData {
	readonly code: typeof FORBIDDEN_ROLE_CODE;
	readonly requiredRoles: readonly Role[];
}

// ── Detectores ────────────────────────────────────────────────────────────────
// Se apoyan EXCLUSIVAMENTE en el `status` tipado de ErrorResponse. Nunca en el
// texto del mensaje ni en la forma de un error de API serializado: olfatear
// strings es frágil y este proyecto ya tiene errores de dominio tipados.

export function isUnauthorizedError(error: unknown): error is ErrorResponse {
	return (
		isRouteErrorResponse(error) && error.status === HTTP_STATUS.UNAUTHORIZED
	);
}

export function isForbiddenError(error: unknown): error is ErrorResponse {
	return isRouteErrorResponse(error) && error.status === HTTP_STATUS.FORBIDDEN;
}

export function isNotFoundError(error: unknown): error is ErrorResponse {
	return isRouteErrorResponse(error) && error.status === HTTP_STATUS.NOT_FOUND;
}

/**
 * Estrecha un 403 genérico al 403 concreto de `requireRole`.
 *
 * Hace falta porque ya existe OTRO 403 en la app: el de Origin no confiable del
 * middleware CSRF (root.tsx), que lleva un body de texto plano. Ese debe
 * mostrar el mensaje genérico, no "te falta el rol X".
 */
export function isForbiddenRoleError(
	error: unknown,
): error is ErrorResponse & { data: ForbiddenRoleData } {
	if (!isForbiddenError(error)) return false;

	const payload: unknown = error.data;

	return (
		typeof payload === "object" &&
		payload !== null &&
		(payload as { code?: unknown }).code === FORBIDDEN_ROLE_CODE
	);
}

// ── Del envelope al error de ruta ─────────────────────────────────────────────

// Status por defecto de los códigos transversales. Los códigos de negocio
// (USER_NOT_FOUND…) declaran el suyo en el diccionario del módulo; sin él, un
// fallo que llega a un loader es un 500 — un error de servidor, porque el loader
// no supo qué hacer con él.
const DEFAULT_STATUS_BY_CODE: Record<string, number> = {
	[RESPONSE_ERROR_CODES.VALIDATION]: HTTP_STATUS.BAD_REQUEST,
	[RESPONSE_ERROR_CODES.NOT_FOUND]: HTTP_STATUS.NOT_FOUND,
	[RESPONSE_ERROR_CODES.UNAUTHORIZED]: HTTP_STATUS.UNAUTHORIZED,
	[RESPONSE_ERROR_CODES.FORBIDDEN]: HTTP_STATUS.FORBIDDEN,
	[RESPONSE_ERROR_CODES.CONFLICT]: HTTP_STATUS.CONFLICT,
};

const STATUS_TEXT: Record<number, string> = {
	[HTTP_STATUS.BAD_REQUEST]: "Bad Request",
	[HTTP_STATUS.UNAUTHORIZED]: "Unauthorized",
	[HTTP_STATUS.FORBIDDEN]: "Forbidden",
	[HTTP_STATUS.NOT_FOUND]: "Not Found",
	[HTTP_STATUS.CONFLICT]: "Conflict",
	[HTTP_STATUS.TOO_MANY_REQUESTS]: "Too Many Requests",
	[HTTP_STATUS.INTERNAL_SERVER_ERROR]: "Internal Server Error",
};

/** Cuerpo que el ErrorBoundary recibe en `useRouteError().data`. */
export interface RouteErrorData {
	readonly code: string;
	readonly message: string;
}

/**
 * Traduce el error del envelope al error de ruta que pinta el ErrorBoundary.
 *
 * Es la contrapartida de `localizeError` para los LOADERS: un action responde
 * `{ success: false }` para que la pantalla siga en pie y muestre un toast, pero
 * un loader que falla no tiene pantalla que mostrar — corta con el status que
 * corresponda.
 *
 * `statusText` explícito por la misma razón que en requireRole: al convertir un
 * `data()` lanzado en ErrorResponse, react-router pone "Internal Server Error"
 * por defecto y el 404 se mostraría como un error interno.
 *
 * @example
 * const result = await context.userService.findById(documentId);
 * if (!result.success) throw toRouteError(result.error, USER_ERROR_MESSAGES);
 */
export function toRouteError(
	error: ResponseError,
	messages: ErrorMessageMap = {},
) {
	const status =
		resolveErrorCopy(error, messages).status ??
		DEFAULT_STATUS_BY_CODE[error.code] ??
		HTTP_STATUS.INTERNAL_SERVER_ERROR;

	return data<RouteErrorData>(
		{ code: error.code, message: resolveErrorMessage(error, messages) },
		{ status, statusText: STATUS_TEXT[status] },
	);
}
