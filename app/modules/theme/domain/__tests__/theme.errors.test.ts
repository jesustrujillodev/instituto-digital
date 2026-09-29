import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	THEME_ERROR_CODES,
	ThemePreferenceNotSavedError,
} from "../theme.errors";

// Se comprueba el CÓDIGO, nunca el mensaje: el mensaje es copia de UI y es
// traducible, el código es contrato.
describe("ThemePreferenceNotSavedError", () => {
	test("carries its stable code", () => {
		expect(new ThemePreferenceNotSavedError().code).toBe(
			THEME_ERROR_CODES.PREFERENCE_NOT_SAVED,
		);
	});

	// Si dejara de extender DomainError, `toResponseError` lo trataría como
	// desconocido y el adaptador respondería UNEXPECTED_ERROR sin decir nada útil.
	test("is recognised as a domain error so its code can travel", () => {
		expect(isDomainError(new ThemePreferenceNotSavedError())).toBe(true);
	});
});
