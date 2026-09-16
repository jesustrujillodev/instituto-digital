import { describe, expect, test } from "vitest";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { TRAINER_ERROR_CODES } from "../../domain/trainer.errors";
import { TRAINER_ERROR_MESSAGES } from "../trainer-error-messages";

describe("TRAINER_ERROR_MESSAGES", () => {
	// Sin entrada, `localizeError` caería a la copia de reserva y el usuario
	// vería "error inesperado" para un fallo que el módulo sí sabe explicar.
	test("cubre todos los códigos del módulo", () => {
		for (const code of Object.values(TRAINER_ERROR_CODES)) {
			expect(TRAINER_ERROR_MESSAGES[code]).toBeDefined();
		}
	});

	test("tiene la entrada de reserva obligatoria", () => {
		expect(
			TRAINER_ERROR_MESSAGES[RESPONSE_ERROR_CODES.UNEXPECTED],
		).toBeDefined();
	});

	// Lo que el cliente no puede saber por su cuenta se pinta en SU campo, no en
	// un toast genérico.
	test("el correo duplicado marca su campo", () => {
		const entry = TRAINER_ERROR_MESSAGES[TRAINER_ERROR_CODES.DUPLICATE_EMAIL];

		expect(typeof entry === "object" && entry.fieldErrors).toEqual({
			email: "Ya existe una cuenta con ese correo",
		});
	});
});
