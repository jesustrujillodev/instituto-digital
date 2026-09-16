import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	THEME_ERROR_CODES,
	ThemeActiveCannotBeDeletedError,
	ThemeCssNotParseableError,
	ThemeNeverPublishedError,
	ThemeNotFoundError,
	ThemePreferenceNotSavedError,
	ThemePresetImmutableError,
} from "../theme.errors";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

// Se comprueba el CÓDIGO, nunca el mensaje: el mensaje es copia de UI y es
// traducible, el código es contrato.
describe("códigos estables", () => {
	test.each([
		[
			new ThemePreferenceNotSavedError(),
			THEME_ERROR_CODES.PREFERENCE_NOT_SAVED,
		],
		[new ThemeNotFoundError(DOCUMENT_ID), THEME_ERROR_CODES.NOT_FOUND],
		[
			new ThemePresetImmutableError(DOCUMENT_ID),
			THEME_ERROR_CODES.PRESET_IMMUTABLE,
		],
		[
			new ThemeActiveCannotBeDeletedError(DOCUMENT_ID),
			THEME_ERROR_CODES.ACTIVE_CANNOT_BE_DELETED,
		],
		[
			new ThemeNeverPublishedError(DOCUMENT_ID),
			THEME_ERROR_CODES.NEVER_PUBLISHED,
		],
		[
			new ThemeCssNotParseableError("faltan tokens"),
			THEME_ERROR_CODES.CSS_NOT_PARSEABLE,
		],
	])("carries its code", (error, code) => {
		expect(error.code).toBe(code);
	});

	// Si dejaran de extender DomainError, `toResponseError` los trataría como
	// desconocidos y el adaptador respondería UNEXPECTED_ERROR sin decir nada útil.
	test.each([
		new ThemePreferenceNotSavedError(),
		new ThemeNotFoundError(DOCUMENT_ID),
		new ThemePresetImmutableError(DOCUMENT_ID),
		new ThemeActiveCannotBeDeletedError(DOCUMENT_ID),
		new ThemeNeverPublishedError(DOCUMENT_ID),
		new ThemeCssNotParseableError("faltan tokens"),
	])("is recognised as a domain error so its code can travel", (error) => {
		expect(isDomainError(error)).toBe(true);
	});

	test("every declared code is unique", () => {
		const codes = Object.values(THEME_ERROR_CODES);
		expect(new Set(codes).size).toBe(codes.length);
	});
});

describe("details", () => {
	// `details` viaja dentro del envelope: el adaptador puede señalar QUÉ tema
	// falló sin volver a inspeccionar la clase del error.
	test("the theme errors say which theme they are about", () => {
		expect(new ThemeNotFoundError(DOCUMENT_ID).details).toEqual({
			documentId: DOCUMENT_ID,
		});
		expect(new ThemePresetImmutableError(DOCUMENT_ID).details).toEqual({
			documentId: DOCUMENT_ID,
		});
	});

	test("the paste error carries the reason it could not be read", () => {
		expect(new ThemeCssNotParseableError("faltan tokens").details).toEqual({
			reason: "faltan tokens",
		});
	});
});
