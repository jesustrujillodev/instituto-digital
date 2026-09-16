import { describe, expect, test } from "vitest";
import { HTTP_STATUS } from "@/shared/http/route-error";
import {
	resolveErrorCopy,
	resolveErrorMessage,
} from "@/shared/response/response.messages";
import type { ResponseError } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { USER_ERROR_CODES } from "../../domain/user.errors";
import { USER_ERROR_MESSAGES } from "../user-error-messages";

const errorOf = (code: string): ResponseError => ({ code, message: "técnico" });

const copyFor = (code: string) =>
	resolveErrorMessage(errorOf(code), USER_ERROR_MESSAGES);

const resolvedFor = (code: string) =>
	resolveErrorCopy(errorOf(code), USER_ERROR_MESSAGES);

describe("USER_ERROR_MESSAGES", () => {
	// Cubrir todos los códigos es lo que permite que añadir un error de dominio
	// obligue a tocar SOLO esta tabla, en vez de una escalera de instanceof en
	// cada action. Un código sin entrada se degrada al texto de reserva sin avisar.
	test("cubre todos los códigos del módulo", () => {
		for (const code of Object.values(USER_ERROR_CODES)) {
			expect(USER_ERROR_MESSAGES[code]).toBeDefined();
		}
	});

	test("declara la copia de reserva de UNEXPECTED", () => {
		expect(USER_ERROR_MESSAGES[RESPONSE_ERROR_CODES.UNEXPECTED]).toBeDefined();
		expect(copyFor("CODIGO_QUE_NO_EXISTE")).toBe(
			"Ha ocurrido un error inesperado.",
		);
	});

	test("ninguna copia filtra el mensaje técnico", () => {
		for (const code of Object.keys(USER_ERROR_MESSAGES)) {
			expect(copyFor(code)).not.toContain("técnico");
		}
	});
});

describe("USER_ERROR_MESSAGES — correo duplicado", () => {
	// Lo que el cliente no puede saber por su cuenta se pinta en SU campo, no en un
	// toast genérico: quien se equivoca de correo necesita verlo junto al input.
	test("cuelga el error del campo email", () => {
		expect(resolvedFor(USER_ERROR_CODES.DUPLICATE_EMAIL).fieldErrors).toEqual({
			email: "Ese correo ya está registrado",
		});
	});

	test("declara 409 para que un loader corte con el status correcto", () => {
		expect(resolvedFor(USER_ERROR_CODES.DUPLICATE_EMAIL).status).toBe(
			HTTP_STATUS.CONFLICT,
		);
	});
});

describe("USER_ERROR_MESSAGES — status por código", () => {
	// `status` solo lo consultan los LOADERS vía toRouteError. Los códigos que solo
	// tienen sentido en un action no lo llevan: un action no corta con status,
	// responde `{ success: false }` para que la pantalla siga en pie.
	test("solo los códigos que un loader puede encontrar declaran status", () => {
		expect(resolvedFor(RESPONSE_ERROR_CODES.VALIDATION).status).toBe(
			HTTP_STATUS.BAD_REQUEST,
		);
		expect(resolvedFor(USER_ERROR_CODES.NOT_FOUND).status).toBe(
			HTTP_STATUS.NOT_FOUND,
		);

		expect(resolvedFor(USER_ERROR_CODES.NOT_ARCHIVED).status).toBeUndefined();
		expect(
			resolvedFor(USER_ERROR_CODES.HAS_RELATED_RECORDS).status,
		).toBeUndefined();
		expect(resolvedFor(USER_ERROR_CODES.INVALID_UPLOAD).status).toBeUndefined();
	});
});

describe("USER_ERROR_MESSAGES — textos accionables", () => {
	// A diferencia del login, aquí quien lee ya está autenticado: la copia puede
	// —y debe— decir qué hacer a continuación.
	test("el borrado sin archivar explica el paso previo", () => {
		expect(copyFor(USER_ERROR_CODES.NOT_ARCHIVED)).toContain("Archiva");
	});

	test("los registros asociados ofrecen la alternativa", () => {
		expect(copyFor(USER_ERROR_CODES.HAS_RELATED_RECORDS)).toContain(
			"archivado",
		);
	});

	// No enumera qué modelos apuntan al usuario: eso lo sabe la base, no el
	// diccionario, y listarlos se desactualizaría al añadir un modelo nuevo.
	test("los registros asociados no enumeran los modelos", () => {
		expect(copyFor(USER_ERROR_CODES.HAS_RELATED_RECORDS)).not.toContain(
			"Session",
		);
	});
});
