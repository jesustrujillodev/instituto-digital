import { describe, expect, test } from "vitest";
import { HTTP_STATUS } from "@/shared/http/route-error";
import {
	resolveErrorCopy,
	resolveErrorMessage,
} from "@/shared/response/response.messages";
import type { ResponseError } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { AUTH_ERROR_CODES } from "../../domain/auth.errors";
import { AUTH_ERROR_MESSAGES } from "../auth-error-messages";
import { SESSION_MONITOR_ERROR_MESSAGES } from "../session-monitor-error-messages";

const errorOf = (code: string): ResponseError => ({ code, message: "técnico" });

const copyFor = (code: string) =>
	resolveErrorMessage(errorOf(code), SESSION_MONITOR_ERROR_MESSAGES);

const statusFor = (code: string) =>
	resolveErrorCopy(errorOf(code), SESSION_MONITOR_ERROR_MESSAGES).status;

describe("SESSION_MONITOR_ERROR_MESSAGES", () => {
	// Diccionario PROPIO y deliberadamente distinto del de login: aquí quien lee ya
	// está autenticado y es administrador, así que la opacidad anti-enumeración no
	// protege nada y solo impediría entender qué pasó.
	test("is explicit where the login dictionary is deliberately opaque", () => {
		expect(copyFor(AUTH_ERROR_CODES.INVALID_SESSION)).not.toBe(
			resolveErrorMessage(
				errorOf(AUTH_ERROR_CODES.INVALID_SESSION),
				AUTH_ERROR_MESSAGES,
			),
		);
	});

	test("names the lockdown instead of hiding it", () => {
		expect(copyFor(AUTH_ERROR_CODES.PLATFORM_LOCKED)).toContain("lockdown");
	});

	test("explains that a revoked session no longer exists", () => {
		expect(copyFor(AUTH_ERROR_CODES.SESSION_NOT_FOUND)).toBe(
			"La sesión ya no existe o ya fue cerrada.",
		);
	});

	test("declares the UNEXPECTED fallback", () => {
		expect(
			SESSION_MONITOR_ERROR_MESSAGES[RESPONSE_ERROR_CODES.UNEXPECTED],
		).toBeDefined();
		expect(copyFor("CODIGO_QUE_NO_EXISTE")).toBe(
			"Ha ocurrido un error inesperado.",
		);
	});

	// `status` solo lo consultan los LOADERS vía toRouteError. Los códigos que un
	// action produce no lo llevan: un action nunca corta con status, responde
	// `{ success: false }` para que la pantalla siga en pie.
	test("only the codes a loader can hit declare a status", () => {
		expect(statusFor(RESPONSE_ERROR_CODES.VALIDATION)).toBe(
			HTTP_STATUS.BAD_REQUEST,
		);
		expect(statusFor(AUTH_ERROR_CODES.SESSION_NOT_FOUND)).toBe(
			HTTP_STATUS.NOT_FOUND,
		);

		expect(statusFor(AUTH_ERROR_CODES.INVALID_SESSION)).toBeUndefined();
		expect(statusFor(AUTH_ERROR_CODES.PLATFORM_LOCKED)).toBeUndefined();
	});

	test("covers every code the panel can produce", () => {
		const reachable = [
			RESPONSE_ERROR_CODES.VALIDATION,
			AUTH_ERROR_CODES.SESSION_NOT_FOUND,
			AUTH_ERROR_CODES.INVALID_SESSION,
			AUTH_ERROR_CODES.PLATFORM_LOCKED,
			RESPONSE_ERROR_CODES.UNEXPECTED,
		];

		for (const code of reachable) {
			expect(SESSION_MONITOR_ERROR_MESSAGES[code]).toBeDefined();
		}
	});

	test("no copy leaks the technical message", () => {
		for (const code of Object.keys(SESSION_MONITOR_ERROR_MESSAGES)) {
			expect(copyFor(code)).not.toContain("técnico");
		}
	});
});
