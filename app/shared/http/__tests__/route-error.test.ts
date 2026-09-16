import { UNSAFE_ErrorResponseImpl as ErrorResponseImpl } from "react-router";
import { describe, expect, test } from "vitest";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import type { ResponseError } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	FORBIDDEN_ROLE_CODE,
	HTTP_STATUS,
	isForbiddenError,
	isForbiddenRoleError,
	isNotFoundError,
	isUnauthorizedError,
	toRouteError,
} from "../route-error";

/** ErrorResponse real: la misma clase que react-router entrega al ErrorBoundary. */
const routeErrorOf = (status: number, data: unknown = null) =>
	new ErrorResponseImpl(status, undefined, data);

const errorOf = (overrides: Partial<ResponseError> = {}): ResponseError => ({
	code: RESPONSE_ERROR_CODES.UNEXPECTED,
	message: "algo falló",
	...overrides,
});

describe("isUnauthorizedError / isForbiddenError / isNotFoundError", () => {
	test("each detector matches only its own status", () => {
		expect(isUnauthorizedError(routeErrorOf(401))).toBe(true);
		expect(isForbiddenError(routeErrorOf(403))).toBe(true);
		expect(isNotFoundError(routeErrorOf(404))).toBe(true);

		expect(isUnauthorizedError(routeErrorOf(403))).toBe(false);
		expect(isForbiddenError(routeErrorOf(404))).toBe(false);
		expect(isNotFoundError(routeErrorOf(500))).toBe(false);
	});

	// Se apoyan EXCLUSIVAMENTE en el status tipado: olfatear el texto del mensaje
	// o la forma de un error serializado es frágil, y este proyecto ya tiene
	// errores tipados.
	test("a plain Error or object is never a route error", () => {
		expect(isUnauthorizedError(new Error("Unauthorized"))).toBe(false);
		expect(isNotFoundError({ status: 404 })).toBe(false);
		expect(isForbiddenError(null)).toBe(false);
	});
});

describe("isForbiddenRoleError", () => {
	// La razón de existir de la función: ya hay OTRO 403 en la app —el de Origin
	// no confiable del middleware CSRF, con body de texto plano—, y ese debe
	// mostrar el mensaje genérico, no "te falta el rol ADMIN".
	test("narrows the requireRole 403 by its code", () => {
		const error = routeErrorOf(HTTP_STATUS.FORBIDDEN, {
			code: FORBIDDEN_ROLE_CODE,
			requiredRoles: ["ADMIN"],
		});

		expect(isForbiddenRoleError(error)).toBe(true);
	});

	test("rejects the CSRF 403, whose body is plain text", () => {
		expect(isForbiddenRoleError(routeErrorOf(403, "Forbidden origin"))).toBe(
			false,
		);
	});

	test("rejects a 403 with no data and a non-403 carrying the code", () => {
		expect(isForbiddenRoleError(routeErrorOf(403, null))).toBe(false);
		expect(
			isForbiddenRoleError(routeErrorOf(401, { code: FORBIDDEN_ROLE_CODE })),
		).toBe(false);
	});
});

describe("toRouteError", () => {
	// El diccionario del módulo manda: es donde un código de negocio declara con
	// qué status debe cortar un loader.
	test("takes the status declared by the module dictionary", () => {
		const messages: ErrorMessageMap = {
			USER_NOT_FOUND: { message: "No existe", status: HTTP_STATUS.NOT_FOUND },
		};

		const result = toRouteError(errorOf({ code: "USER_NOT_FOUND" }), messages);

		expect(result.init?.status).toBe(404);
		expect(result.data).toEqual({
			code: "USER_NOT_FOUND",
			message: "No existe",
		});
	});

	test("falls back to the default status of a transversal code", () => {
		expect(
			toRouteError(errorOf({ code: RESPONSE_ERROR_CODES.VALIDATION })).init
				?.status,
		).toBe(400);
		expect(
			toRouteError(errorOf({ code: RESPONSE_ERROR_CODES.NOT_FOUND })).init
				?.status,
		).toBe(404);
		expect(
			toRouteError(errorOf({ code: RESPONSE_ERROR_CODES.UNAUTHORIZED })).init
				?.status,
		).toBe(401);
		expect(
			toRouteError(errorOf({ code: RESPONSE_ERROR_CODES.FORBIDDEN })).init
				?.status,
		).toBe(403);
		expect(
			toRouteError(errorOf({ code: RESPONSE_ERROR_CODES.CONFLICT })).init
				?.status,
		).toBe(409);
	});

	// Un código de negocio que llega a un loader sin status declarado es un error
	// de servidor: el loader no supo qué hacer con él.
	test("an unknown code without declared status becomes a 500", () => {
		expect(toRouteError(errorOf({ code: "RARO" })).init?.status).toBe(500);
	});

	// El status del diccionario gana al default del código transversal.
	test("the dictionary status wins over the default", () => {
		const messages: ErrorMessageMap = {
			[RESPONSE_ERROR_CODES.NOT_FOUND]: { message: "x", status: 410 },
		};

		expect(
			toRouteError(errorOf({ code: RESPONSE_ERROR_CODES.NOT_FOUND }), messages)
				.init?.status,
		).toBe(410);
	});

	// Sin statusText explícito, react-router pone "Internal Server Error" al
	// convertir un `data()` lanzado en ErrorResponse, y un 404 se mostraría como
	// un error interno.
	test("sets an explicit statusText that matches the status", () => {
		expect(
			toRouteError(errorOf({ code: RESPONSE_ERROR_CODES.NOT_FOUND })).init
				?.statusText,
		).toBe("Not Found");
		expect(toRouteError(errorOf({ code: "RARO" })).init?.statusText).toBe(
			"Internal Server Error",
		);
	});

	// El código NUNCA se traduce: es lo que permite al ErrorBoundary y a los tests
	// distinguir el caso sin comparar strings de UI.
	test("keeps the stable code and localises only the message", () => {
		const messages: ErrorMessageMap = {
			USER_NOT_FOUND: "Ese usuario no existe",
		};

		const result = toRouteError(
			errorOf({ code: "USER_NOT_FOUND", message: "user not found" }),
			messages,
		);

		expect(result.data.code).toBe("USER_NOT_FOUND");
		expect(result.data.message).toBe("Ese usuario no existe");
	});

	test("interpolates a message that depends on details", () => {
		const messages: ErrorMessageMap = {
			TOO_MANY_ATTEMPTS: {
				message: (error) => `Espera ${error.details?.retryAfterMs} ms`,
			},
		};

		const result = toRouteError(
			errorOf({ code: "TOO_MANY_ATTEMPTS", details: { retryAfterMs: 5000 } }),
			messages,
		);

		expect(result.data.message).toBe("Espera 5000 ms");
	});
});
