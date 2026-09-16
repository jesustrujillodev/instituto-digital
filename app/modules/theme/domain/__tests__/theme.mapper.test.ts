import { describe, expect, test } from "vitest";
import {
	DEFAULT_THEME_TOKENS,
	FONT_CATALOG,
	THEME_PRESETS,
	THEME_TOKENS_SCHEMA_VERSION,
} from "../theme.config";
import { ThemeCssNotParseableError } from "../theme.errors";
import {
	exportThemeCss,
	fontStack,
	fromThemeJson,
	parseThemeCss,
	themeCss,
	themeFingerprint,
	toCssTokenSet,
	tokensEqual,
	toThemeJson,
	toThemeTokens,
} from "../theme.mapper";
import { FONT_FAMILY_KEYS, type ThemeTokens } from "../theme.rules";

const withShared = (shared: Partial<ThemeTokens["shared"]>): ThemeTokens => ({
	...DEFAULT_THEME_TOKENS,
	shared: { ...DEFAULT_THEME_TOKENS.shared, ...shared },
});

describe("toCssTokenSet", () => {
	test("resolves the font key into a real stack", () => {
		const set = toCssTokenSet(withShared({ fontSans: "geist" }));

		expect(set.shared["theme-font-sans"]).toBe(FONT_CATALOG.geist.stack);
		expect(fontStack("geist")).toBe(FONT_CATALOG.geist.stack);
	});

	// La pila del sistema es la salida cuando la clave no existe: un tema guardado
	// con una fuente que después se retira del catálogo tiene que seguir pintando.
	test("falls back to the system stack for an unknown key", () => {
		expect(fontStack("no-existe" as never)).toBe(FONT_CATALOG.system.stack);
	});

	test("expands the six shadow parameters into the whole scale", () => {
		const set = toCssTokenSet(DEFAULT_THEME_TOKENS);

		expect(set.shared["theme-shadow-2xs"]).toBeTruthy();
		expect(set.shared["theme-shadow-2xl"]).toBeTruthy();
		expect(set.shared["theme-shadow"]).toBeTruthy();
	});

	test("carries the metrics under the prefixed names app.css expects", () => {
		const set = toCssTokenSet(DEFAULT_THEME_TOKENS);

		expect(set.shared.radius).toBe(DEFAULT_THEME_TOKENS.shared.radius);
		expect(set.shared["theme-spacing"]).toBe(
			DEFAULT_THEME_TOKENS.shared.spacing,
		);
		expect(set.shared["theme-border-width"]).toBe(
			DEFAULT_THEME_TOKENS.shared.borderWidth,
		);
		expect(set.shared["theme-tracking"]).toBe(
			DEFAULT_THEME_TOKENS.shared.letterSpacing,
		);
	});

	// Recorrer la ALLOWLIST y no las claves del objeto es lo que impide que una
	// fila corrupta de la base cuele nombres nuevos en el `<style>` de la app.
	test("ignores colour keys that are not in the allowlist", () => {
		const set = toCssTokenSet({
			...DEFAULT_THEME_TOKENS,
			light: {
				...DEFAULT_THEME_TOKENS.light,
				"}html{display:none": "red",
			} as never,
		});

		expect(Object.keys(set.light)).not.toContain("}html{display:none");
		expect(set.light.background).toBe(DEFAULT_THEME_TOKENS.light.background);
	});

	test("skips a colour that is not even a string", () => {
		const set = toCssTokenSet({
			...DEFAULT_THEME_TOKENS,
			light: { ...DEFAULT_THEME_TOKENS.light, primary: 42 as never },
		});

		expect(set.light.primary).toBeUndefined();
	});
});

describe("themeCss", () => {
	test("is the single path from tokens to a stylesheet", () => {
		const css = themeCss(DEFAULT_THEME_TOKENS, "dark");

		expect(css).toContain("color-scheme:dark");
		expect(css).toContain("--background:oklch(0.145 0 0)");
		expect(css).toContain("--theme-font-sans:");
	});

	test("accepts a scoped selector", () => {
		expect(themeCss(DEFAULT_THEME_TOKENS, "light", ".x")).toContain(".x{");
	});
});

describe("round-trip CSS", () => {
	// Test obligatorio del plan: `parse(export(t))` equivale a `t`. Si esto se
	// rompe, exportar un tema y volver a pegarlo lo cambia en silencio.
	test("exporting and re-parsing gives back the same tokens", () => {
		expect(parseThemeCss(exportThemeCss(DEFAULT_THEME_TOKENS))).toEqual(
			DEFAULT_THEME_TOKENS,
		);
	});

	test("holds for every factory preset, fonts and metrics included", () => {
		for (const preset of THEME_PRESETS) {
			expect(parseThemeCss(exportThemeCss(preset.tokens))).toEqual(
				preset.tokens,
			);
		}
	});

	// La opción "del sistema" no tiene un nombre de familia que buscar dentro de
	// la pila: se reconoce comparando la pila entera.
	test("holds for the system font, which has no family name to look for", () => {
		const tokens = withShared({ fontSans: "system", fontHeading: "system" });

		expect(parseThemeCss(exportThemeCss(tokens))).toEqual(tokens);
	});

	// Barrido del catálogo ENTERO y no de una muestra: dos entradas cuyas pilas se
	// contienen la una a la otra (`courier-new` vive dentro de `system-mono`) se
	// reconocerían cruzadas, y una fuente añadida al catálogo sin pensar en esto
	// convertiría el tema guardado en otro distinto al volver a leerlo.
	test("holds for every font in the catalogue", () => {
		for (const key of FONT_FAMILY_KEYS) {
			const tokens = withShared({
				fontSans: key,
				fontHeading: key,
				fontSerif: key,
				fontMono: key,
			});

			expect(parseThemeCss(exportThemeCss(tokens))).toEqual(tokens);
		}
	});
});

describe("parseThemeCss", () => {
	const pasted = `
		:root {
			--background: #ffffff;
			--foreground: #09090b;
			--primary: hsl(240 5.9% 10%);
			--radius: 0.3rem;
			--font-sans: Montserrat, sans-serif;
			--no-lo-conozco: nada;
		}
		.dark {
			--background: #09090b;
			--foreground: #fafafa;
			--primary: #fafafa;
		}
	`;

	test("reads a block pasted from tweakcn and normalises it to OKLCH", () => {
		const tokens = parseThemeCss(pasted);

		expect(tokens.light.background).toMatch(/^oklch\(/);
		expect(tokens.dark.foreground).toMatch(/^oklch\(/);
		expect(tokens.shared.radius).toBe("0.3rem");
		expect(tokens.shared.fontSans).toBe("montserrat");
	});

	// Tolerante con lo que falta: un token ausente hereda del tema base en vez de
	// dejar un hueco que después pintaría un color heredado de otro tema.
	test("fills the missing tokens from the base theme", () => {
		const tokens = parseThemeCss(pasted);

		expect(tokens.light.ring).toBe(DEFAULT_THEME_TOKENS.light.ring);
		expect(tokens.shared.spacing).toBe(DEFAULT_THEME_TOKENS.shared.spacing);
	});

	test("uses the given theme as the base instead of the default one", () => {
		const base = withShared({ spacing: "0.3rem" });

		expect(parseThemeCss(pasted, base).shared.spacing).toBe("0.3rem");
	});

	/*
	 * Tolerante también con lo que viene fuera de rango.
	 *
	 * Pasar el valor tal cual era lo peor de las dos opciones: el borrador quedaba
	 * con una medida que el validador iba a rechazar al autoguardar, un segundo
	 * después y sin poder señalar qué línea del CSS pegado la traía. tweakcn
	 * permite espaciados y radios que esta interfaz no aguanta.
	 */
	test("clamps measures that fall outside their range", () => {
		const tokens = parseThemeCss(`
			:root {
				--background: #fff;
				--foreground: #000;
				--primary: #333;
				--radius: 9rem;
				--spacing: 0.1rem;
				--font-size: 2rem;
				--letter-spacing: -1em;
			}
		`);

		expect(tokens.shared.radius).toBe("2rem");
		expect(tokens.shared.spacing).toBe("0.2rem");
		expect(tokens.shared.fontSize).toBe("1.25rem");
		expect(tokens.shared.letterSpacing).toBe("-0.05em");
	});

	// Una medida en otra unidad no es una medida de este token: cae al base en vez
	// de convertirse a ojo.
	test("falls back to the base when the unit is not the token's own", () => {
		const tokens = parseThemeCss(
			":root { --background: #fff; --foreground: #000; --primary: #333; --radius: 10px; }",
		);

		expect(tokens.shared.radius).toBe(DEFAULT_THEME_TOKENS.shared.radius);
	});

	// Sin bloque `.dark` la variante oscura se queda como estaba: es más útil que
	// dejarla igual a la clara, y "derivar oscuro" está a un clic.
	test("keeps the previous dark variant when the paste has none", () => {
		const tokens = parseThemeCss(
			":root { --background: #fff; --foreground: #000; --primary: #333; }",
		);

		expect(tokens.dark).toEqual(DEFAULT_THEME_TOKENS.dark);
	});

	test("accumulates several :root blocks, last one winning", () => {
		const tokens = parseThemeCss(`
			:root { --background: #ffffff; --foreground: #000000; --primary: #111111; }
			:root { --primary: #ff0000; }
		`);

		expect(tokens.light.primary).toBe(
			parseThemeCss(
				":root{--background:#fff;--foreground:#000;--primary:#ff0000}",
			).light.primary,
		);
	});

	test("ignores a font outside the curated catalogue", () => {
		const tokens = parseThemeCss(
			":root { --background:#fff; --foreground:#000; --primary:#333; --font-sans: Comic Sans MS, cursive; }",
		);

		expect(tokens.shared.fontSans).toBe(DEFAULT_THEME_TOKENS.shared.fontSans);
	});

	/*
	 * Bloques de tipografía tal y como los escribe tweakcn, con la pila declarada
	 * a su manera y no a la nuestra. Es el caso real por el que se ampliaron el
	 * catálogo y el bundle: si una de estas líneas no se reconoce, el tema pegado
	 * se queda con la fuente que hubiera antes y nadie recibe un aviso.
	 */
	test.each([
		[
			"Poppins / Playfair Display / Space Mono",
			"Poppins, sans-serif",
			"Playfair Display, serif",
			"Space Mono, monospace",
			["poppins", "playfair-display", "space-mono"],
		],
		[
			"Architects Daughter with system serif and mono",
			"Architects Daughter, sans-serif",
			'"Times New Roman", Times, serif',
			'"Courier New", Courier, monospace',
			["architects-daughter", "times-new-roman", "courier-new"],
		],
		[
			"Courier New everywhere, unquoted",
			"Courier New, monospace",
			"Courier New, monospace",
			"Courier New, monospace",
			["courier-new", "courier-new", "courier-new"],
		],
		[
			"Libre Baskerville with the generic system stacks",
			"Libre Baskerville, serif",
			'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
			["libre-baskerville", "system-serif", "system-mono"],
		],
	])("reads the typography of %s", (_name, sans, serif, mono, expected) => {
		const tokens = parseThemeCss(`
			:root {
				--background: #ffffff;
				--foreground: #000000;
				--primary: #333333;
				--font-sans: ${sans};
				--font-serif: ${serif};
				--font-mono: ${mono};
			}
		`);

		expect([
			tokens.shared.fontSans,
			tokens.shared.fontSerif,
			tokens.shared.fontMono,
		]).toEqual(expected);
	});

	test("ignores a length in a unit it does not accept", () => {
		const tokens = parseThemeCss(
			":root { --background:#fff; --foreground:#000; --primary:#333; --radius: calc(1rem + 2px); }",
		);

		expect(tokens.shared.radius).toBe(DEFAULT_THEME_TOKENS.shared.radius);
	});

	test("ignores a shadow parameter that is not a number", () => {
		const tokens = parseThemeCss(
			":root { --background:#fff; --foreground:#000; --primary:#333; --shadow-blur: mucho; }",
		);

		expect(tokens.shared.shadow.blur).toBe(
			DEFAULT_THEME_TOKENS.shared.shadow.blur,
		);
	});

	test("also understands the shadcn spelling of the tracking and border tokens", () => {
		const tokens = parseThemeCss(`
			:root {
				--background:#fff; --foreground:#000; --primary:#333;
				--tracking-normal: 0.02em;
				--default-border-width: 2px;
			}
		`);

		expect(tokens.shared.letterSpacing).toBe("0.02em");
		expect(tokens.shared.borderWidth).toBe("2px");
	});

	// Sin esto, pegar cualquier CSS produciría un "tema" idéntico al base salvo
	// por un token suelto, y el admin creería haber importado algo.
	describe("rechazo", () => {
		test("refuses a paste with no :root or .dark block at all", () => {
			expect(() => parseThemeCss("body { color: red }")).toThrow(
				ThemeCssNotParseableError,
			);
		});

		test("refuses a :root block without the minimum set of tokens", () => {
			expect(() => parseThemeCss(":root { --radius: 1rem; }")).toThrow(
				ThemeCssNotParseableError,
			);
		});

		test("names the tokens that are missing", () => {
			try {
				parseThemeCss(":root { --background: #fff; }");
				expect.unreachable("debía lanzar");
			} catch (error) {
				expect((error as ThemeCssNotParseableError).details.reason).toContain(
					"foreground",
				);
			}
		});
	});
});

describe("JSON de ida y vuelta", () => {
	test("exports with the schema version and reads it back", () => {
		const raw = toThemeJson("Mi tema", DEFAULT_THEME_TOKENS);
		const document = fromThemeJson(raw);

		expect(document?.version).toBe(THEME_TOKENS_SCHEMA_VERSION);
		expect(document?.name).toBe("Mi tema");
		expect(document?.tokens).toEqual(DEFAULT_THEME_TOKENS);
	});

	test("rejects malformed JSON instead of throwing", () => {
		expect(fromThemeJson("{no soy json")).toBeNull();
		expect(fromThemeJson("null")).toBeNull();
		expect(fromThemeJson('"una cadena"')).toBeNull();
	});

	// La versión se comprueba ANTES que el contenido: un archivo de un esquema
	// futuro tiene que fallar por lo que es, no por qué token le falta.
	test("rejects a document from another schema version", () => {
		const raw = toThemeJson("Mi tema", DEFAULT_THEME_TOKENS).replace(
			`"version": ${THEME_TOKENS_SCHEMA_VERSION}`,
			'"version": 99',
		);

		expect(fromThemeJson(raw)).toBeNull();
	});

	test("rejects a document whose tokens do not validate", () => {
		expect(
			fromThemeJson(
				JSON.stringify({
					version: THEME_TOKENS_SCHEMA_VERSION,
					tokens: { shared: {}, light: {}, dark: {} },
				}),
			),
		).toBeNull();
	});

	test("names an unnamed document instead of leaving it blank", () => {
		const raw = JSON.stringify({
			version: THEME_TOKENS_SCHEMA_VERSION,
			tokens: DEFAULT_THEME_TOKENS,
		});

		expect(fromThemeJson(raw)?.name).toBe("Tema importado");
	});
});

describe("toThemeTokens", () => {
	test("accepts a valid Json column", () => {
		expect(toThemeTokens(DEFAULT_THEME_TOKENS)).toEqual(DEFAULT_THEME_TOKENS);
	});

	// Devolver null en vez de lanzar es la decisión importante: una fila corrupta
	// no puede dejar la plataforma entera sin pintar.
	test("returns null for a corrupt row instead of throwing", () => {
		expect(toThemeTokens(null)).toBeNull();
		expect(toThemeTokens({ shared: {} })).toBeNull();
		expect(
			toThemeTokens({
				...DEFAULT_THEME_TOKENS,
				light: { ...DEFAULT_THEME_TOKENS.light, primary: "</style>" },
			}),
		).toBeNull();
	});
});

describe("tokensEqual", () => {
	test("two identical sets are equal", () => {
		expect(tokensEqual(DEFAULT_THEME_TOKENS, { ...DEFAULT_THEME_TOKENS })).toBe(
			true,
		);
	});

	// Si esto dependiera del orden de las claves, "hay cambios sin publicar" se
	// quedaría encendido para siempre en cuanto la base devolviera el Json en
	// otro orden.
	test("key order does not make two identical sets differ", () => {
		const reordered: ThemeTokens = {
			dark: { ...DEFAULT_THEME_TOKENS.dark },
			light: Object.fromEntries(
				Object.entries(DEFAULT_THEME_TOKENS.light).reverse(),
			) as ThemeTokens["light"],
			shared: { ...DEFAULT_THEME_TOKENS.shared },
		};

		expect(tokensEqual(DEFAULT_THEME_TOKENS, reordered)).toBe(true);
	});

	test("a single changed token is enough to differ", () => {
		expect(
			tokensEqual(DEFAULT_THEME_TOKENS, withShared({ radius: "1rem" })),
		).toBe(false);

		expect(
			tokensEqual(DEFAULT_THEME_TOKENS, {
				...DEFAULT_THEME_TOKENS,
				light: { ...DEFAULT_THEME_TOKENS.light, primary: "oklch(0.5 0 0)" },
			}),
		).toBe(false);
	});
});

describe("themeFingerprint", () => {
	// Es lo que decide si el navegador descarta los CSS guardados de otros modos:
	// si variara con el orden de claves, los tiraría en cada petición.
	test("is stable across key order, like tokensEqual", () => {
		const reordered: ThemeTokens = {
			dark: { ...DEFAULT_THEME_TOKENS.dark },
			light: Object.fromEntries(
				Object.entries(DEFAULT_THEME_TOKENS.light).reverse(),
			) as ThemeTokens["light"],
			shared: { ...DEFAULT_THEME_TOKENS.shared },
		};

		expect(themeFingerprint(reordered)).toBe(
			themeFingerprint(DEFAULT_THEME_TOKENS),
		);
	});

	test("changes when a single token changes", () => {
		expect(themeFingerprint(withShared({ radius: "1rem" }))).not.toBe(
			themeFingerprint(DEFAULT_THEME_TOKENS),
		);
	});

	test("is a short base-36 string", () => {
		expect(themeFingerprint(DEFAULT_THEME_TOKENS)).toMatch(/^[0-9a-z]{1,7}$/);
	});
});
