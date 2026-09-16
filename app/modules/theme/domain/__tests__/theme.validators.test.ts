import { describe, expect, test } from "vitest";
import { DEFAULT_THEME_TOKENS } from "../theme.config";
import { THEME_MODES, type ThemeTokens } from "../theme.rules";
import {
	safeParseThemeTokens,
	validateCloneTheme,
	validateCreateTheme,
	validateImportThemeCss,
	validateRenameTheme,
	validateSaveDraft,
	validateSetThemeMode,
	validateThemeTarget,
	validateThemeTokens,
} from "../theme.validators";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

const withShared = (shared: Partial<ThemeTokens["shared"]>) => ({
	...DEFAULT_THEME_TOKENS,
	shared: { ...DEFAULT_THEME_TOKENS.shared, ...shared },
});

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

describe("identificadores y nombres", () => {
	test("the target only accepts a uuid", () => {
		expect(validateThemeTarget({ documentId: DOCUMENT_ID })).toEqual({
			documentId: DOCUMENT_ID,
		});
		expect(() => validateThemeTarget({ documentId: "7" })).toThrow();
	});

	test("a name is trimmed and cannot be empty or absurdly long", () => {
		expect(validateCreateTheme({ name: "  Mi tema  " }).name).toBe("Mi tema");
		expect(() => validateCreateTheme({ name: "   " })).toThrow();
		expect(() => validateCreateTheme({ name: "x".repeat(61) })).toThrow();
	});

	test("the origin theme is optional but must be a uuid when present", () => {
		expect(validateCreateTheme({ name: "x" }).fromDocumentId).toBeUndefined();
		expect(() =>
			validateCreateTheme({ name: "x", fromDocumentId: "no" }),
		).toThrow();
	});

	test("clone and rename need both a uuid and a name", () => {
		expect(
			validateCloneTheme({ documentId: DOCUMENT_ID, name: "Copia" }),
		).toEqual({ documentId: DOCUMENT_ID, name: "Copia" });
		expect(() =>
			validateRenameTheme({ documentId: DOCUMENT_ID, name: "" }),
		).toThrow();
	});
});

describe("validateImportThemeCss", () => {
	test("accepts a pasted block and trims it", () => {
		expect(
			validateImportThemeCss({ documentId: DOCUMENT_ID, css: "  :root{}  " })
				.css,
		).toBe(":root{}");
	});

	test("rejects an empty paste", () => {
		expect(() =>
			validateImportThemeCss({ documentId: DOCUMENT_ID, css: "   " }),
		).toThrow();
	});

	// Un bloque gigantesco sería una forma barata de hacer trabajar al parser en
	// cada petición.
	test("rejects a paste that is absurdly large", () => {
		expect(() =>
			validateImportThemeCss({
				documentId: DOCUMENT_ID,
				css: "a".repeat(20_001),
			}),
		).toThrow();
	});
});

describe("validateThemeTokens", () => {
	test("accepts the default theme", () => {
		expect(validateThemeTokens(DEFAULT_THEME_TOKENS)).toEqual(
			DEFAULT_THEME_TOKENS,
		);
	});

	// Exigir el conjunto COMPLETO es deliberado: un tema al que le falta un token
	// heredaría el del tema anterior y produciría combinaciones que nadie eligió.
	test("rejects a token set with a missing colour", () => {
		const incomplete = {
			...DEFAULT_THEME_TOKENS,
			light: { ...DEFAULT_THEME_TOKENS.light },
		};
		delete (incomplete.light as Record<string, string>).ring;

		expect(() => validateThemeTokens(incomplete)).toThrow();
	});

	test("rejects a value that is not a colour the browser can paint", () => {
		expect(() =>
			validateThemeTokens({
				...DEFAULT_THEME_TOKENS,
				light: { ...DEFAULT_THEME_TOKENS.light, primary: "muy-azul" },
			}),
		).toThrow();
	});

	// La comprobación se hace interpretando el color de verdad y no con una
	// regex: lo que pasa el filtro tiene que poder pintarse.
	test("accepts hex, hsl and oklch alike", () => {
		for (const value of ["#3b82f6", "hsl(210 90% 60%)", "oklch(0.6 0.2 250)"]) {
			expect(() =>
				validateThemeTokens({
					...DEFAULT_THEME_TOKENS,
					light: { ...DEFAULT_THEME_TOKENS.light, primary: value },
				}),
			).not.toThrow();
		}
	});

	describe("medidas", () => {
		test.each([
			["radius", "0.5rem", true],
			["radius", "9rem", false],
			["radius", "10px", false],
			["radius", "calc(1rem)", false],
			["borderWidth", "2px", true],
			["borderWidth", "20px", false],
			// El servidor no acepta nada que el slider no pueda ofrecer: el rango es
			// el mismo objeto para los dos (LENGTH_RANGES). Antes el panel llegaba a
			// 4px de borde y el validador tragaba 8.
			["borderWidth", "6px", false],
			["spacing", "0.25rem", true],
			["spacing", "5rem", false],
			// Por debajo de 0.2rem el botón pequeño queda más bajo que su texto y los
			// iconos bajan del objetivo de 24px de WCAG 2.5.8.
			["spacing", "0.1rem", false],
			["fontSize", "1rem", true],
			["fontSize", "4rem", false],
			// El tamaño base ya arrastra toda la escala `--text-*`: 1.5rem dejaba el
			// texto de cuerpo en 24px y 0.75rem las etiquetas en 9px.
			["fontSize", "1.5rem", false],
			["fontSize", "0.75rem", false],
			["letterSpacing", "-0.02em", true],
			["letterSpacing", "5em", false],
			["letterSpacing", "-0.08em", false],
		])("%s = %s", (key, value, valid) => {
			const check = () => validateThemeTokens(withShared({ [key]: value }));
			if (valid) expect(check).not.toThrow();
			else expect(check).toThrow();
		});
	});

	test("only fonts from the curated catalogue are accepted", () => {
		expect(() =>
			validateThemeTokens(withShared({ fontSans: "times-new-roman" })),
		).not.toThrow();
		expect(() =>
			validateThemeTokens(withShared({ fontSans: "comic-sans" as never })),
		).toThrow();
	});

	describe("sombra", () => {
		const shadow = (overrides: Record<string, unknown>) =>
			withShared({
				shadow: {
					...DEFAULT_THEME_TOKENS.shared.shadow,
					...overrides,
				} as ThemeTokens["shared"]["shadow"],
			});

		test("bounds each parameter", () => {
			expect(() => validateThemeTokens(shadow({ opacity: 0.5 }))).not.toThrow();
			expect(() => validateThemeTokens(shadow({ opacity: 2 }))).toThrow();
			expect(() => validateThemeTokens(shadow({ blur: 100 }))).toThrow();
			expect(() => validateThemeTokens(shadow({ spread: -100 }))).toThrow();
			expect(() => validateThemeTokens(shadow({ offsetX: 100 }))).toThrow();
			expect(() => validateThemeTokens(shadow({ offsetY: -100 }))).toThrow();
			expect(() => validateThemeTokens(shadow({ blur: "3px" }))).toThrow();
		});

		test("the shadow colour goes through the same check as any other", () => {
			expect(() =>
				validateThemeTokens(shadow({ color: "</style>" })),
			).toThrow();
		});
	});
});

describe("safeParseThemeTokens", () => {
	// El camino de LECTURA no puede lanzar: una fila corrupta dejaría la
	// plataforma entera sin pintar en vez de caer al tema base.
	test("returns null instead of throwing", () => {
		expect(safeParseThemeTokens(DEFAULT_THEME_TOKENS)).toEqual(
			DEFAULT_THEME_TOKENS,
		);
		expect(safeParseThemeTokens({ nada: true })).toBeNull();
		expect(safeParseThemeTokens(undefined)).toBeNull();
	});
});

describe("validateSaveDraft", () => {
	test("needs both the uuid and a complete token set", () => {
		expect(
			validateSaveDraft({
				documentId: DOCUMENT_ID,
				tokens: DEFAULT_THEME_TOKENS,
			}),
		).toEqual({ documentId: DOCUMENT_ID, tokens: DEFAULT_THEME_TOKENS });

		expect(() =>
			validateSaveDraft({ documentId: DOCUMENT_ID, tokens: null }),
		).toThrow();
	});
});

// ===============================================================
// Normalización del color
// ===============================================================
// Validar no era normalizar: un color se comprobaba y se guardaba tal cual. El
// caso que rompía la plataforma era `oklch(0.5 0.1 20` sin cerrar — culori lo
// interpreta, así que pasaba el filtro, y en CSS una función sin cerrar se come
// el resto de la hoja: los tokens siguientes y el bloque @media de oscuro.

describe("normalización de colores al validar", () => {
	const withPrimary = (value: string) => ({
		...DEFAULT_THEME_TOKENS,
		light: { ...DEFAULT_THEME_TOKENS.light, primary: value },
	});

	test("cierra un oklch sin cerrar en vez de guardarlo tal cual", () => {
		expect(
			validateThemeTokens(withPrimary("oklch(0.5 0.1 20")).light.primary,
		).toBe("oklch(0.5 0.1 20)");
	});

	test("todo lo que se guarda sale en oklch, venga en el formato que venga", () => {
		for (const value of ["#3b82f6", "hsl(210 90% 60%)", "rgb(59 130 246)"]) {
			expect(validateThemeTokens(withPrimary(value)).light.primary).toMatch(
				/^oklch\([^)]+\)$/,
			);
		}
	});

	test("conserva el alfa al normalizar", () => {
		expect(validateThemeTokens(withPrimary("#ffffff1a")).light.primary).toMatch(
			/^oklch\(1 0 0 \/ [\d.]+%\)$/,
		);
	});

	test("también normaliza el color de la sombra", () => {
		const tokens = validateThemeTokens({
			...DEFAULT_THEME_TOKENS,
			shared: {
				...DEFAULT_THEME_TOKENS.shared,
				shadow: { ...DEFAULT_THEME_TOKENS.shared.shadow, color: "#000000" },
			},
		});

		expect(tokens.shared.shadow.color).toBe("oklch(0 0 0)");
	});

	test("un valor que no se puede interpretar sigue sin pasar", () => {
		expect(() => validateThemeTokens(withPrimary("oklch(muy azul"))).toThrow();
	});
});
