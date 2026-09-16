import { describe, expect, test } from "vitest";
import {
	THEME_ERROR_CODES,
	ThemeActiveCannotBeDeletedError,
	ThemeNeverPublishedError,
	ThemePresetImmutableError,
} from "../theme.errors";
import {
	assertThemeDeletable,
	assertThemeEditable,
	assertThemePublished,
	COLOR_TOKENS,
	CONTRAST_PAIRS,
	type ColorTokenName,
	clampLength,
	contrastLevel,
	contrastRatio,
	deriveDarkVariant,
	deriveShadowScale,
	evaluateContrast,
	evaluateDensity,
	formatThemeColor,
	isThemeColor,
	isThemeMode,
	LENGTH_RANGES,
	normalizeThemeColor,
	parseThemeColor,
	resolveThemeMode,
	serializeThemeCss,
	THEME_MODES,
	type ThemeColorTokens,
	type ThemeTokenSet,
	themeColorToHex,
	themeHtmlClass,
} from "../theme.rules";

const tokens: ThemeTokenSet = {
	shared: { radius: "0.5rem" },
	light: { background: "oklch(1 0 0)" },
	dark: { background: "oklch(0.145 0 0)" },
};

/** Juego completo, para las funciones que recorren la tupla entera. */
const allColors = (value: string): ThemeColorTokens =>
	Object.fromEntries(
		COLOR_TOKENS.map((token) => [token, value]),
	) as ThemeColorTokens;

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
	// ve un tema en la landing (donde solo hay cookie) y otro tras entrar.
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
	// admisible es el tema por defecto, nunca un fallo.
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

describe("serializeThemeCss", () => {
	test("light emits only the light variant, with color-scheme light", () => {
		const css = serializeThemeCss(tokens, "light");

		expect(css).toContain("color-scheme:light");
		expect(css).toContain("--background:oklch(1 0 0)");
		expect(css).not.toContain("oklch(0.145 0 0)");
		expect(css).not.toContain("@media");
	});

	test("dark emits only the dark variant, with color-scheme dark", () => {
		const css = serializeThemeCss(tokens, "dark");

		expect(css).toContain("color-scheme:dark");
		expect(css).toContain("--background:oklch(0.145 0 0)");
		expect(css).not.toContain("oklch(1 0 0)");
		expect(css).not.toContain("@media");
	});

	// Este es el test que protege la ausencia de flash: en modo system el
	// servidor no puede saber el ajuste del sistema operativo del cliente, así
	// que emite AMBAS variantes y deja que el motor de CSS elija. Si alguien
	// "simplifica" esto a una sola variante, vuelve el flash y además el cambio
	// de tema del SO deja de reflejarse en vivo.
	test("system emits both variants behind prefers-color-scheme", () => {
		const css = serializeThemeCss(tokens, "system");

		expect(css).toContain("color-scheme:light dark");
		expect(css).toContain("--background:oklch(1 0 0)");
		expect(css).toContain("@media (prefers-color-scheme:dark)");
		expect(css.indexOf("oklch(0.145 0 0)")).toBeGreaterThan(
			css.indexOf("@media"),
		);
	});

	test("shared tokens appear in every mode", () => {
		for (const mode of THEME_MODES) {
			expect(serializeThemeCss(tokens, mode)).toContain("--radius:0.5rem");
		}
	});

	// El selector alternativo existe para acotar el tema a un subárbol sin
	// reimplementar el serializador fuera del dominio.
	test("honours a custom selector in every mode", () => {
		for (const mode of THEME_MODES) {
			expect(serializeThemeCss(tokens, mode, ".preview")).toContain(
				".preview{",
			);
		}
	});

	// Los tokens vienen de una columna Json de la base de datos y el CSS se
	// inyecta con dangerouslySetInnerHTML: un valor capaz de cerrar la etiqueta
	// <style> sería XSS.
	describe("saneamiento", () => {
		test("drops a value that could close the style tag", () => {
			const css = serializeThemeCss(
				{
					shared: {},
					light: { background: "red</style><script>alert(1)</script>" },
					dark: {},
				},
				"light",
			);

			expect(css).not.toContain("<script>");
			expect(css).not.toContain("</style>");
			expect(css).not.toContain("--background");
		});

		test("drops a value that escapes its own declaration", () => {
			const css = serializeThemeCss(
				{ shared: {}, light: { background: "red;position:fixed" }, dark: {} },
				"light",
			);

			expect(css).not.toContain("position:fixed");
		});

		test("drops a token whose NAME is not a plain custom property", () => {
			const css = serializeThemeCss(
				{ shared: {}, light: { "bg}html{display:none": "red" }, dark: {} },
				"light",
			);

			expect(css).not.toContain("display:none");
		});

		test("keeps legitimate values, including alpha and function syntax", () => {
			const css = serializeThemeCss(
				{
					shared: {},
					light: {
						border: "oklch(1 0 0 / 10%)",
						"chart-1": "oklch(0.87 0 0)",
					},
					dark: {},
				},
				"light",
			);

			expect(css).toContain("--border:oklch(1 0 0 / 10%)");
			expect(css).toContain("--chart-1:oklch(0.87 0 0)");
		});
	});
});

// ===============================================================
// Fase B — color, contraste, sombras e invariantes
// ===============================================================

describe("parseThemeColor", () => {
	test("reads oklch, hex and hsl into the same shape", () => {
		expect(parseThemeColor("oklch(0.5 0.1 200)")).toEqual({
			l: 0.5,
			c: 0.1,
			h: 200,
			alpha: 1,
		});

		expect(parseThemeColor("#ffffff")?.l).toBeCloseTo(1, 3);
		expect(parseThemeColor("hsl(0 0% 0%)")?.l).toBeCloseTo(0, 3);
	});

	test("keeps the alpha channel", () => {
		expect(parseThemeColor("oklch(0.5 0.1 200 / 50%)")?.alpha).toBeCloseTo(
			0.5,
			3,
		);
	});

	// Un gris no tiene tono. culori devuelve NaN/undefined y en CSS hay que
	// escribir un número: 0 es la única opción legible.
	test("a hueless colour reports hue 0 instead of NaN", () => {
		expect(parseThemeColor("oklch(0.5 0 0)")?.h).toBe(0);
	});

	test("returns null for anything it cannot read", () => {
		expect(parseThemeColor("no-soy-un-color")).toBeNull();
		expect(parseThemeColor("")).toBeNull();
		expect(isThemeColor("oklch(1 0 0)")).toBe(true);
		expect(isThemeColor("</style>")).toBe(false);
	});

	// `none` es sintaxis válida de CSS Color 4 y deja el canal SIN definir, no a
	// cero. Sin los respaldos, un token así produciría `oklch(NaN NaN NaN)` y el
	// navegador se comería la declaración entera sin avisar.
	test("reads an all-none colour as a defined zero", () => {
		expect(parseThemeColor("oklch(none none none)")).toEqual({
			l: 0,
			c: 0,
			h: 0,
			alpha: 1,
		});
	});

	test("reads a partially defined colour without losing the rest", () => {
		expect(parseThemeColor("oklch(0.5 none 200)")).toEqual({
			l: 0.5,
			c: 0,
			h: 200,
			alpha: 1,
		});
	});
});

describe("formatThemeColor", () => {
	test("omits the alpha when the colour is opaque", () => {
		expect(formatThemeColor({ l: 0.5, c: 0.1, h: 200, alpha: 1 })).toBe(
			"oklch(0.5 0.1 200)",
		);
	});

	test("writes the alpha as a percentage when it is not", () => {
		expect(formatThemeColor({ l: 0.5, c: 0.1, h: 200, alpha: 0.5 })).toBe(
			"oklch(0.5 0.1 200 / 50%)",
		);
	});

	// Sin redondeo, un round-trip acumula decimales y "hay cambios sin publicar"
	// se queda encendido para siempre.
	test("rounds so a round-trip is stable", () => {
		const once = normalizeThemeColor("#3b82f6");
		expect(normalizeThemeColor(once)).toBe(once);
	});

	test("leaves an unreadable value untouched instead of inventing one", () => {
		expect(normalizeThemeColor("var(--otra-cosa)")).toBe("var(--otra-cosa)");
	});
});

describe("themeColorToHex", () => {
	test("converts to the six-digit form the native picker needs", () => {
		expect(themeColorToHex("oklch(1 0 0)")).toBe("#ffffff");
		expect(themeColorToHex("oklch(0 0 0)")).toBe("#000000");
	});

	test("falls back to black instead of throwing on garbage", () => {
		expect(themeColorToHex("no-soy-un-color")).toBe("#000000");
	});
});

describe("deriveDarkVariant", () => {
	test("inverts lightness while keeping hue and chroma", () => {
		const derived = deriveDarkVariant(allColors("oklch(0.9 0.12 250)"));
		const parsed = parseThemeColor(derived.background);

		expect(parsed?.c).toBeCloseTo(0.12, 3);
		expect(parsed?.h).toBeCloseTo(250, 1);
		expect(parsed?.l).toBeLessThan(0.9);
	});

	// Invertir a secas mandaría el blanco a negro puro, más duro que cualquier
	// tema oscuro decente. El rango comprimido es lo que lo hace usable.
	test("white does not become pure black", () => {
		const derived = deriveDarkVariant(allColors("oklch(1 0 0)"));
		const lightness = parseThemeColor(derived.background)?.l ?? 0;

		expect(lightness).toBeGreaterThan(0.1);
		expect(lightness).toBeLessThan(0.2);
	});

	test("covers every declared token", () => {
		const derived = deriveDarkVariant(allColors("oklch(1 0 0)"));
		for (const token of COLOR_TOKENS) expect(derived[token]).toBeTruthy();
	});

	// Un token ilegible se copia tal cual: perderlo dejaría el tema incompleto
	// justo cuando ya estaba roto.
	test("copies an unreadable token instead of dropping it", () => {
		const source = { ...allColors("oklch(1 0 0)"), primary: "basura" };
		expect(deriveDarkVariant(source).primary).toBe("basura");
	});

	test("treats a missing token as empty instead of crashing", () => {
		const incomplete = { ...allColors("oklch(1 0 0)") };
		delete (incomplete as Partial<ThemeColorTokens>).primary;

		expect(deriveDarkVariant(incomplete).primary).toBe("");
	});
});

describe("contrastRatio", () => {
	// Valores conocidos de WCAG 2.1. Si esto se desviara, el panel de contraste
	// estaría dando permiso o alarma sobre datos falsos.
	test("black on white is 21:1 and a colour against itself is 1:1", () => {
		expect(contrastRatio("#ffffff", "#000000")).toBe(21);
		expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
	});

	test("the classic AA boundary grey lands just above 4.5", () => {
		const ratio = contrastRatio("#ffffff", "#767676") ?? 0;

		expect(ratio).toBeGreaterThanOrEqual(4.5);
		expect(ratio).toBeLessThan(4.6);
	});

	test("returns null when a colour cannot be read", () => {
		expect(contrastRatio("no-soy-un-color", "#000000")).toBeNull();
		expect(contrastRatio("#ffffff", "tampoco")).toBeNull();
	});
});

describe("contrastLevel", () => {
	test("maps each ratio to its WCAG grade", () => {
		expect(contrastLevel(21)).toBe("AAA");
		expect(contrastLevel(7)).toBe("AAA");
		expect(contrastLevel(4.5)).toBe("AA");
		expect(contrastLevel(3)).toBe("AA-large");
		expect(contrastLevel(2.9)).toBe("fail");
	});
});

describe("evaluateContrast", () => {
	test("grades every pair of the variant", () => {
		const results = evaluateContrast({
			...allColors("oklch(1 0 0)"),
			foreground: "oklch(0 0 0)",
		});

		expect(results.length).toBeGreaterThan(0);
		expect(
			results.find((result) => result.foreground === "foreground")?.ratio,
		).toBe(21);
		// El resto de pares son fondo y texto iguales: 1:1, que no cumple.
		expect(results.some((result) => result.level === "fail")).toBe(true);
	});

	test("reports a null level for a pair it cannot measure", () => {
		const results = evaluateContrast({
			...allColors("oklch(1 0 0)"),
			foreground: "basura",
		});

		expect(
			results.find((result) => result.foreground === "foreground")?.level,
		).toBeNull();
	});

	// El panel se pinta sobre el borrador en vivo, y un token puede faltar
	// mientras se importa un tema: la fila sale "sin medir" en vez de reventar la
	// pantalla entera del builder.
	test("survives a variant with missing tokens", () => {
		const incomplete = allColors("oklch(1 0 0)");
		delete (incomplete as Partial<ThemeColorTokens>).foreground;
		delete (incomplete as Partial<ThemeColorTokens>).card;

		const results = evaluateContrast(incomplete);

		expect(
			results.find((result) => result.foreground === "foreground")?.ratio,
		).toBeNull();
		expect(
			results.find((result) => result.background === "card")?.ratio,
		).toBeNull();
	});
});

describe("deriveShadowScale", () => {
	const shadow = {
		color: "oklch(0 0 0)",
		opacity: 0.1,
		blur: 3,
		spread: 0,
		offsetX: 0,
		offsetY: 1,
	};

	test("produces the whole scale from the six parameters", () => {
		const scale = deriveShadowScale(shadow);

		expect(Object.keys(scale)).toEqual([
			"shadow-2xs",
			"shadow-xs",
			"shadow-sm",
			"shadow",
			"shadow-md",
			"shadow-lg",
			"shadow-xl",
			"shadow-2xl",
		]);
	});

	test("the scale opens: a bigger step blurs more", () => {
		const scale = deriveShadowScale(shadow);
		const blurOf = (value: string) =>
			Number.parseFloat(value.split(" ")[2] ?? "0");

		expect(blurOf(scale["shadow-2xl"])).toBeGreaterThan(
			blurOf(scale["shadow-2xs"]),
		);
	});

	// Una sombra sin color no puede tumbar la hoja de estilos entera: se apaga.
	test("an unreadable colour turns the shadow transparent instead of failing", () => {
		const scale = deriveShadowScale({ ...shadow, color: "basura" });
		expect(scale.shadow).toContain("transparent");
	});

	test("clamps the alpha of the widest step to 1", () => {
		const scale = deriveShadowScale({ ...shadow, opacity: 1 });
		// El paso 2xl multiplica la opacidad por 2.5; sin recorte saldría `/ 250%`.
		expect(scale["shadow-2xl"]).not.toContain("%)");
	});
});

// ===============================================================
// Invariantes de la biblioteca
// ===============================================================

const preset = { documentId: "preset-1", isPreset: true };
const own = { documentId: "own-1", isPreset: false };

describe("assertThemeEditable", () => {
	// La invariante vive en el dominio y no solo en la UI: ocultar el botón no
	// impide un POST a mano, y los presets son lo único a lo que se puede volver
	// cuando un tema publicado sale mal.
	test("rejects a factory preset with its stable code", () => {
		expect(() => assertThemeEditable(preset)).toThrow(
			ThemePresetImmutableError,
		);

		try {
			assertThemeEditable(preset);
			expect.unreachable("debía lanzar");
		} catch (error) {
			expect((error as ThemePresetImmutableError).code).toBe(
				THEME_ERROR_CODES.PRESET_IMMUTABLE,
			);
		}
	});

	test("allows a theme of your own", () => {
		expect(() => assertThemeEditable(own)).not.toThrow();
	});
});

describe("assertThemeDeletable", () => {
	test("rejects the theme the platform is currently serving", () => {
		expect(() => assertThemeDeletable(own, own.documentId)).toThrow(
			ThemeActiveCannotBeDeletedError,
		);
	});

	// Un preset no se borra aunque no esté activo: la regla de edición manda
	// antes que la de actividad.
	test("rejects a preset before even looking at what is active", () => {
		expect(() => assertThemeDeletable(preset, null)).toThrow(
			ThemePresetImmutableError,
		);
	});

	test("allows deleting your own inactive theme", () => {
		expect(() => assertThemeDeletable(own, "otro")).not.toThrow();
	});
});

describe("assertThemePublished", () => {
	test("rejects a theme that was never published", () => {
		expect(() =>
			assertThemePublished({ documentId: "x", publishedTokens: null }),
		).toThrow(ThemeNeverPublishedError);

		expect(() =>
			assertThemePublished({ documentId: "x", publishedTokens: undefined }),
		).toThrow(ThemeNeverPublishedError);
	});

	test("allows one that has a published version", () => {
		expect(() =>
			assertThemePublished({ documentId: "x", publishedTokens: {} }),
		).not.toThrow();
	});
});

describe("COLOR_TOKENS", () => {
	// La tupla es una ALLOWLIST: `toCssTokenSet` la recorre en vez de las claves
	// del objeto guardado, así que un duplicado o un nombre con caracteres raros
	// se propagaría al `<style>` de todas las páginas.
	test("has no duplicates and every name is a safe custom property", () => {
		expect(new Set(COLOR_TOKENS).size).toBe(COLOR_TOKENS.length);

		for (const token of COLOR_TOKENS as readonly ColorTokenName[]) {
			expect(token).toMatch(/^[a-z0-9-]+$/);
		}
	});
});

describe("contraste con alfa", () => {
	// `border` en oscuro es blanco al 10%. Medirlo sin componer daba 19,79:1 —el
	// contraste del blanco puro contra el fondo—, cuando lo que se ve en pantalla
	// contrasta 1,25:1. WCAG mide colores ya compuestos.
	test("compone el color translúcido sobre su fondo antes de medir", () => {
		expect(contrastRatio("oklch(0.145 0 0)", "oklch(1 0 0 / 10%)")).toBe(1.25);
		expect(contrastRatio("oklch(0.145 0 0)", "oklch(1 0 0)")).toBe(19.79);
	});

	// Sin fondo conocido no hay nada que componer: "sin medir" es más honesto que
	// un número que finge que el color es opaco.
	test("devuelve null cuando el fondo mismo es translúcido", () => {
		expect(contrastRatio("oklch(1 0 0 / 10%)", "oklch(0 0 0)")).toBeNull();
	});
});

describe("CONTRAST_PAIRS", () => {
	const has = (background: ColorTokenName, foreground: ColorTokenName) =>
		CONTRAST_PAIRS.some(
			(pair) =>
				pair.background === background && pair.foreground === foreground,
		);

	// Ningún componente pinta `destructive-foreground`: alarmar por ese par era
	// pedirle al admin que arreglara algo que nadie ve.
	test("no mide un par que la interfaz no combina", () => {
		expect(
			CONTRAST_PAIRS.some(
				(pair) => pair.foreground === "destructive-foreground",
			),
		).toBe(false);
	});

	// El botón destructivo real es `bg-destructive/10 text-destructive`.
	test("mide el botón destructivo con su capa al 10%", () => {
		expect(
			CONTRAST_PAIRS.find((pair) => pair.foreground === "destructive"),
		).toMatchObject({ background: "background", tint: 0.1, usage: "text" });
	});

	test("cubre el texto secundario, los enlaces y el anillo de foco", () => {
		expect(has("background", "muted-foreground")).toBe(true);
		expect(has("card", "muted-foreground")).toBe(true);
		expect(has("background", "primary")).toBe(true);
		expect(has("background", "ring")).toBe(true);
		expect(has("background", "input")).toBe(true);
	});

	test("cada par dice dónde se ve", () => {
		for (const pair of CONTRAST_PAIRS) {
			expect(pair.label.length).toBeGreaterThan(0);
		}
	});
});

describe("evaluateContrast · mínimo por uso", () => {
	const base = { ...allColors("oklch(1 0 0)"), foreground: "oklch(0 0 0)" };

	const rowOf = (
		colors: ThemeColorTokens,
		background: ColorTokenName,
		foreground: ColorTokenName,
	) =>
		evaluateContrast(colors).find(
			(result) =>
				result.background === background && result.foreground === foreground,
		);

	// 4,34 es exactamente lo que dan los cuatro presets de fábrica en claro. El
	// grado dice "solo texto grande" y la cabecera antes lo contaba como AA.
	test("un par de texto en 4,34 no cumple, aunque el grado diga texto grande", () => {
		const row = rowOf(
			{
				...base,
				muted: "oklch(0.97 0 0)",
				"muted-foreground": "oklch(0.556 0 0)",
			},
			"muted",
			"muted-foreground",
		);

		expect(row?.ratio).toBe(4.34);
		expect(row?.level).toBe("AA-large");
		expect(row?.passes).toBe(false);
	});

	// WCAG 1.4.11: lo que identifica un control se mide contra 3:1, no contra 4,5.
	test("un elemento de interfaz se mide contra 3:1", () => {
		const row = rowOf(
			{ ...base, ring: "oklch(0.6 0 0)" },
			"background",
			"ring",
		);

		expect(row?.ratio).toBe(3.95);
		expect(row?.level).toBe("AA-large");
		expect(row?.passes).toBe(true);
	});

	test("un par informativo se mide pero no se exige", () => {
		const row = rowOf(base, "background", "border");

		expect(row?.usage).toBe("info");
		expect(row?.ratio).not.toBeNull();
		expect(row?.passes).toBeNull();
	});

	// Un color ilegible es "no lo sé", no "está mal": contarlo como fallo daría
	// una cuenta de errores inventada mientras se pega un tema.
	test("lo que no se puede medir nunca sale como fallo", () => {
		const row = rowOf(
			{ ...base, foreground: "basura" },
			"background",
			"foreground",
		);

		expect(row?.ratio).toBeNull();
		expect(row?.passes).toBeNull();
	});
});

describe("clampLength", () => {
	test("recorta al rango del token en vez de rechazar", () => {
		expect(clampLength("radius", "9rem")).toBe("2rem");
		expect(clampLength("spacing", "0.05rem")).toBe("0.2rem");
		expect(clampLength("fontSize", "2rem")).toBe("1.25rem");
		expect(clampLength("letterSpacing", "-1em")).toBe("-0.05em");
	});

	test("deja pasar lo que ya está dentro", () => {
		expect(clampLength("radius", "0.625rem")).toBe("0.625rem");
		expect(clampLength("borderWidth", "1px")).toBe("1px");
	});

	// La unidad es parte de la definición: `--radius: 10px` en un CSS pegado no
	// es un radio de esta aplicación, y convertirlo a rem sería inventárselo.
	test("null si la medida no viene en la unidad del token", () => {
		expect(clampLength("radius", "10px")).toBeNull();
		expect(clampLength("radius", "calc(1rem + 2px)")).toBeNull();
		expect(clampLength("borderWidth", "")).toBeNull();
	});
});

/**
 * El suelo del espaciado no es una preferencia: `--spacing` multiplica también
 * `h-*`, `w-*` y `size-*`, así que decide el tamaño de los controles.
 */
describe("evaluateDensity", () => {
	const at = (spacing: string, fontSize = "1rem") =>
		evaluateDensity({ spacing, fontSize }).map((issue) => issue.id);

	test("el valor por defecto no tiene nada que avisar", () => {
		expect(at("0.25rem")).toEqual([]);
	});

	test("por debajo de 0.25rem el objetivo baja de los 24 px de WCAG 2.5.8", () => {
		expect(at("0.24rem")).toEqual(["target-size"]);
		expect(at("0.2rem")).toEqual(["target-size"]);
	});

	// El aviso cruza los dos sliders: con el espaciado en el suelo y el tamaño
	// base arriba, el botón pequeño queda más bajo que su propia caja de línea.
	test("avisa también cuando el texto ya no cabe en el control", () => {
		expect(at("0.2rem", "1.25rem")).toEqual(["target-size", "control-height"]);
		expect(at("0.2rem", "1rem")).not.toContain("control-height");
	});

	test("una medida ilegible no inventa avisos", () => {
		expect(at("ancho")).toEqual([]);
	});

	test("el aviso dice el número que lo demuestra y qué mover", () => {
		const [issue] = evaluateDensity({ spacing: "0.2rem", fontSize: "1rem" });

		expect(issue?.title).toContain("19.2 px");
		expect(issue?.detail).toContain("0.25 rem");
	});
});

/**
 * Un solo rango para las tres puertas —slider, validador e importador—: cuando
 * vivían por separado, el slider del grosor de borde llegaba a 4 px y el
 * validador aceptaba 8.
 */
describe("LENGTH_RANGES", () => {
	test("todo rango tiene un paso que cabe dentro", () => {
		for (const [token, range] of Object.entries(LENGTH_RANGES)) {
			expect(range.min, token).toBeLessThan(range.max);
			expect(range.step, token).toBeGreaterThan(0);
			expect(range.step, token).toBeLessThanOrEqual(range.max - range.min);
		}
	});

	// El suelo del espaciado es justo el que mantiene el botón pequeño por encima
	// de su texto; bajarlo sin mirar esto rompe controles sin fallar ninguna prueba.
	test("el suelo del espaciado deja el control por encima de su texto", () => {
		expect(
			evaluateDensity({
				spacing: `${LENGTH_RANGES.spacing.min}rem`,
				fontSize: "1rem",
			}).map((issue) => issue.id),
		).not.toContain("control-height");
	});
});
