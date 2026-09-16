import { describe, expect, test } from "vitest";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { GROUP_ERROR_CODES } from "../../domain/group.errors";
import { GROUP_ERROR_MESSAGES } from "../group-error-messages";

describe("GROUP_ERROR_MESSAGES", () => {
	// Sin entrada, `localizeError` caería a la copia de reserva y el usuario
	// vería "error inesperado" para un fallo que el módulo sí sabe explicar.
	test("cubre todos los códigos del módulo", () => {
		for (const code of Object.values(GROUP_ERROR_CODES)) {
			expect(GROUP_ERROR_MESSAGES[code]).toBeDefined();
		}
	});

	test("tiene la entrada de reserva obligatoria", () => {
		expect(GROUP_ERROR_MESSAGES[RESPONSE_ERROR_CODES.UNEXPECTED]).toBeDefined();
	});

	test("el nombre duplicado marca su campo", () => {
		const entry = GROUP_ERROR_MESSAGES[GROUP_ERROR_CODES.DUPLICATE_NAME];

		expect(typeof entry === "object" && entry.fieldErrors).toEqual({
			name: "Ya existe un grupo con ese nombre",
		});
	});
});
