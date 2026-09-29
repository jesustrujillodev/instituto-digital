import { describe, expect, test } from "vitest";
import { THEME_MODES } from "../theme.rules";
import { validateSetThemeMode } from "../theme.validators";

describe("validateSetThemeMode", () => {
	test("accepts every declared mode", () => {
		for (const mode of THEME_MODES) {
			expect(validateSetThemeMode({ mode })).toEqual({ mode });
		}
	});

	// El valor llega de un FormData, así que puede ser cualquier cosa. Lo que
	// importa es que FALLE en la frontera y no acabe en la cookie: un modo
	// inventado se serviría tal cual en la siguiente petición.
	test("rejects an unknown mode", () => {
		expect(() => validateSetThemeMode({ mode: "neon" })).toThrow();
	});

	test("rejects a missing or non-string mode", () => {
		expect(() => validateSetThemeMode({})).toThrow();
		expect(() => validateSetThemeMode({ mode: null })).toThrow();
		expect(() => validateSetThemeMode({ mode: 1 })).toThrow();
	});
});
