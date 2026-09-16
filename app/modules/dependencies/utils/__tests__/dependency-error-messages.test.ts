import { describe, expect, test } from "vitest";
import { HTTP_STATUS } from "@/shared/http/route-error";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { DEPENDENCY_ERROR_CODES } from "../../domain/dependency.errors";
import { DEPENDENCY_ERROR_MESSAGES } from "../dependency-error-messages";

const copyFor = (code: string) => {
	const entry = DEPENDENCY_ERROR_MESSAGES[code];
	return typeof entry === "string" ? { message: entry } : entry;
};

describe("DEPENDENCY_ERROR_MESSAGES", () => {
	// Si faltara una entrada, ese fallo llegaría al usuario como "Ha ocurrido un
	// error inesperado" y perdería la única pista de cómo resolverlo.
	test("cubre todos los códigos del módulo", () => {
		for (const code of Object.values(DEPENDENCY_ERROR_CODES)) {
			expect(DEPENDENCY_ERROR_MESSAGES[code]).toBeDefined();
		}
	});

	test("cubre también los códigos compartidos", () => {
		expect(
			DEPENDENCY_ERROR_MESSAGES[RESPONSE_ERROR_CODES.VALIDATION],
		).toBeDefined();
		expect(
			DEPENDENCY_ERROR_MESSAGES[RESPONSE_ERROR_CODES.UNEXPECTED],
		).toBeDefined();
	});

	test("ninguna copia va en inglés ni filtra el mensaje técnico", () => {
		for (const code of Object.values(DEPENDENCY_ERROR_CODES)) {
			const copy = copyFor(code);

			expect(copy?.message).toBeTruthy();
			expect(copy?.message).not.toContain("Dependency");
		}
	});

	// Solo los loaders lo consultan, vía toRouteError: es lo que convierte "no
	// existe" en un 404 real en vez de un 500.
	test("no encontrada corta con 404", () => {
		expect(copyFor(DEPENDENCY_ERROR_CODES.NOT_FOUND)?.status).toBe(
			HTTP_STATUS.NOT_FOUND,
		);
	});

	test("nombre duplicado corta con 409", () => {
		expect(copyFor(DEPENDENCY_ERROR_CODES.DUPLICATE_NAME)?.status).toBe(
			HTTP_STATUS.CONFLICT,
		);
	});

	// Lo que el cliente no puede saber por su cuenta se pinta en SU campo, no en un
	// toast genérico que deja al usuario buscando qué corregir.
	test("el nombre duplicado aterriza en el campo del nombre", () => {
		expect(copyFor(DEPENDENCY_ERROR_CODES.DUPLICATE_NAME)?.fieldErrors).toEqual(
			{
				name: "Ya existe una dependencia con ese nombre",
			},
		);
	});

	// Es la razón de ser de la traducción por meta.target del repositorio: antes de
	// distinguirlos, designar un segundo titular respondía "ese nombre ya existe".
	test("ya tiene titular no comparte copia con el nombre duplicado", () => {
		expect(copyFor(DEPENDENCY_ERROR_CODES.ALREADY_HAS_HEAD)?.message).not.toBe(
			copyFor(DEPENDENCY_ERROR_CODES.DUPLICATE_NAME)?.message,
		);
	});

	// Un error de mutación no lleva status: el action responde { success: false } y
	// la pantalla sigue en pie para poder corregirlo.
	test("los errores de mutación no cortan con un status", () => {
		for (const code of [
			DEPENDENCY_ERROR_CODES.INACTIVE,
			DEPENDENCY_ERROR_CODES.ALREADY_HAS_HEAD,
			DEPENDENCY_ERROR_CODES.HEAD_MUST_BELONG,
			DEPENDENCY_ERROR_CODES.HEAD_MUST_BE_ACTIVE,
		]) {
			expect(copyFor(code)?.status).toBeUndefined();
		}
	});
});
