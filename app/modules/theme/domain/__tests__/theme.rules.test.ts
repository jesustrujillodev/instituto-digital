import { describe, expect, test } from "vitest";
import {
	isThemeMode,
	resolveThemeMode,
	THEME_MODES,
	themeHtmlClass,
} from "../theme.rules";

describe("isThemeMode", () => {
	test("accepts every declared mode and nothing else", () => {
		for (const mode of THEME_MODES) expect(isThemeMode(mode)).toBe(true);

		expect(isThemeMode("solarized")).toBe(false);
		expect(isThemeMode(null)).toBe(false);
		expect(isThemeMode(undefined)).toBe(false);
		expect(isThemeMode(1)).toBe(false);
	});
});

describe("resolveThemeMode", () => {
	// La precedencia es el corazón de la feature: si se invierte, la misma persona
	// ve un modo en la landing (donde solo hay cookie) y otro tras entrar.
	test("the cookie wins over the account column", () => {
		expect(resolveThemeMode("light", "dark")).toBe("light");
	});

	test("falls back to the account column when there is no cookie", () => {
		expect(resolveThemeMode(null, "dark")).toBe("dark");
	});

	test("falls back to system when neither source has a preference", () => {
		expect(resolveThemeMode(null, null)).toBe("system");
	});

	// Cookie manipulada o columna de una versión anterior: el peor desenlace
	// admisible es el modo por defecto, nunca un fallo.
	test("ignores unknown values from either source instead of failing", () => {
		expect(resolveThemeMode("neon", "dark")).toBe("dark");
		expect(resolveThemeMode("neon", "sepia")).toBe("system");
		expect(resolveThemeMode({ mode: "dark" }, undefined)).toBe("system");
	});
});

describe("themeHtmlClass", () => {
	test("only the explicit dark mode gets the .dark class", () => {
		expect(themeHtmlClass("dark")).toBe("dark");
		expect(themeHtmlClass("light")).toBe("");
	});

	// Con system NO se pone `dark`: quien decide es el @media. La clase
	// `theme-system` es el gancho del custom variant de app.css — sin ella las
	// utilidades `dark:` quedarían inertes en el modo por defecto.
	test("system gets theme-system, never dark", () => {
		expect(themeHtmlClass("system")).toBe("theme-system");
	});
});
