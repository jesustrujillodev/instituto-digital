import { converter, wcagContrast } from "culori";
import * as v from "valibot";
import {
	ThemeActiveCannotBeDeletedError,
	ThemeNeverPublishedError,
	ThemePresetImmutableError,
} from "./theme.errors";

// ===============================================================
// Vocabulario
// ===============================================================

/**
 * Modos de esquema de color. ÚNICO punto de variación: el schema de valibot, el
 * tipo `ThemeMode` y la resolución de abajo derivan todos de esta tupla.
 *
 * `system` no es un tercer tema — es la ausencia de elección explícita, que se
 * delega al sistema operativo vía `prefers-color-scheme`.
 */
export const THEME_MODES = ["light", "dark", "system"] as const;

/** Las dos variantes que un tema define de verdad. `system` no es una variante. */
export const THEME_VARIANTS = ["light", "dark"] as const;

export type ThemeVariantName = (typeof THEME_VARIANTS)[number];

/**
 * Los 36 tokens de color de un tema, en el orden en que se editan.
 *
 * Es una ALLOWLIST, no una lista de referencia: `toCssTokenSet` recorre esta
 * tupla en vez de las claves del objeto guardado, así que una fila de base de
 * datos con tokens inventados no puede colar nombres nuevos en el `<style>`.
 *
 * Los 28 primeros son los de shadcn; `destructive-foreground`, `success*` y
 * `warning*` se añadieron en la fase A (docs/theme/00-modo-oscuro.md §4.1).
 */
export const COLOR_TOKENS = [
	"background",
	"foreground",
	"card",
	"card-foreground",
	"popover",
	"popover-foreground",
	"primary",
	"primary-foreground",
	"secondary",
	"secondary-foreground",
	"muted",
	"muted-foreground",
	"accent",
	"accent-foreground",
	"destructive",
	"destructive-foreground",
	"success",
	"success-foreground",
	"warning",
	"warning-foreground",
	"border",
	"input",
	"ring",
	"chart-1",
	"chart-2",
	"chart-3",
	"chart-4",
	"chart-5",
	"sidebar",
	"sidebar-foreground",
	"sidebar-primary",
	"sidebar-primary-foreground",
	"sidebar-accent",
	"sidebar-accent-foreground",
	"sidebar-border",
	"sidebar-ring",
] as const;

export type ColorTokenName = (typeof COLOR_TOKENS)[number];

/**
 * Claves del catálogo de fuentes.
 *
 * Vive aquí y no en `theme.config.ts` porque es VOCABULARIO —lo que el esquema
 * de valibot admite—, igual que `THEME_MODES`. El catálogo con el paquete de
 * `@fontsource` y la pila real de cada una sí es configuración, y está tipado
 * como `Record<FontFamilyKey, …>`: añadir una clave aquí sin darle entrada allí
 * no compila.
 */
export const FONT_FAMILY_KEYS = [
	"inter",
	"geist",
	"roboto",
	"open-sans",
	"montserrat",
	"poppins",
	"architects-daughter",
	"playfair-display",
	"merriweather",
	"libre-baskerville",
	"jetbrains-mono",
	"fira-code",
	"space-mono",
	// Pilas del sistema: no descargan nada. Las tres `system-*` son genéricas —
	// cada máquina resuelve una fuente distinta— y las dos siguientes nombran una
	// familia concreta que Windows y macOS traen instalada de fábrica.
	"system",
	"system-serif",
	"system-mono",
	"times-new-roman",
	"courier-new",
] as const;

export type FontFamilyKey = (typeof FONT_FAMILY_KEYS)[number];

// ===============================================================
// Modelo de tokens
// ===============================================================

/** Parámetros de la sombra. La escala `--shadow-*` se DERIVA de ellos. */
export interface ThemeShadowTokens {
	color: string;
	opacity: number;
	blur: number;
	spread: number;
	offsetX: number;
	offsetY: number;
}

/** Lo que no depende de la variante: tipografía, métricas y sombras. */
export interface ThemeSharedTokens {
	radius: string;
	borderWidth: string;
	spacing: string;
	fontSans: FontFamilyKey;
	fontSerif: FontFamilyKey;
	fontMono: FontFamilyKey;
	fontHeading: FontFamilyKey;
	fontSize: string;
	letterSpacing: string;
	shadow: ThemeShadowTokens;
}

export type ThemeColorTokens = Record<ColorTokenName, string>;

/**
 * El tema editable. Es lo que se guarda en `Theme.draftTokens` /
 * `Theme.publishedTokens` y lo que el builder manipula.
 *
 * NO es lo que se escribe en el `<style>`: para eso hay que expandirlo a
 * custom properties (resolver la fuente del catálogo, derivar la escala de
 * sombras), y de eso se encarga `toCssTokenSet` en theme.mapper.ts.
 */
export interface ThemeTokens {
	shared: ThemeSharedTokens;
	light: ThemeColorTokens;
	dark: ThemeColorTokens;
}

/**
 * Custom properties ya expandidas, listas para serializar. Es la forma de
 * SALIDA del mapper y la entrada de `serializeThemeCss` — nunca se persiste.
 */
export interface ThemeTokenSet {
	/** Tokens iguales en ambas variantes (radius, tipografía, sombras, métricas). */
	shared: Record<string, string>;
	light: Record<string, string>;
	dark: Record<string, string>;
}

// ===============================================================
// Color: parseo, formato y derivación
// ===============================================================

const toOklch = converter("oklch");
const toRgb = converter("rgb");

export interface OklchColor {
	l: number;
	c: number;
	h: number;
	alpha: number;
}

/** Redondeo estable: evita que un round-trip acumule decimales infinitos. */
const round = (value: number, decimals: number) => {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
};

/**
 * Cualquier color CSS que culori entienda → OKLCH.
 *
 * `null` cuando no se puede interpretar. Un tema pegado desde fuera puede traer
 * hex, hsl o basura; quien llama decide si eso es un fallo de frontera o un
 * token que se deja como está.
 */
export const parseThemeColor = (value: string): OklchColor | null => {
	const parsed = toOklch(value.trim());
	if (!parsed) return null;

	return {
		l: round(parsed.l ?? 0, 4),
		c: round(parsed.c ?? 0, 4),
		// Un gris no tiene tono; culori devuelve NaN/undefined y en CSS se
		// escribe 0 — cualquier otro valor sería igual de arbitrario y menos legible.
		h: round(parsed.h ?? 0, 3),
		alpha: round(parsed.alpha ?? 1, 4),
	};
};

/** `true` si el valor es un color que el navegador va a saber pintar. */
export const isThemeColor = (value: string): boolean =>
	parseThemeColor(value) !== null;

/**
 * OKLCH → texto CSS.
 *
 * Siempre en OKLCH y nunca en el formato de entrada: así el builder, la base de
 * datos y el CSS exportado hablan un solo espacio de color, y el picker no tiene
 * que adivinar en cuál está trabajando.
 */
export const formatThemeColor = ({ l, c, h, alpha }: OklchColor): string => {
	const base = `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 3)}`;
	return alpha >= 1 ? `${base})` : `${base} / ${round(alpha * 100, 2)}%)`;
};

/** Normaliza a OKLCH, o devuelve el original si no hay nada que interpretar. */
export const normalizeThemeColor = (value: string): string => {
	const parsed = parseThemeColor(value);
	return parsed ? formatThemeColor(parsed) : value;
};

/** Hex de 6 dígitos para el `<input type="color">` del picker. */
export const themeColorToHex = (value: string): string => {
	const rgb = toRgb(value.trim());
	if (!rgb) return "#000000";

	const channel = (n: number) =>
		Math.round(Math.min(1, Math.max(0, n)) * 255)
			.toString(16)
			.padStart(2, "0");

	return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
};

/**
 * Rango de luminancia de la variante derivada.
 *
 * Invertir a secas mandaría el blanco puro (`l = 1`) a negro puro, más duro que
 * cualquier tema oscuro decente. Comprimir en este rango reproduce de cerca los
 * valores del tema por defecto de shadcn (fondo 0.145, texto 0.985) y deja algo
 * que ya se puede leer.
 */
const DARK_LIGHTNESS = { min: 0.12, max: 0.98 } as const;

/**
 * Punto de PARTIDA para la variante oscura: invierte la luminancia OKLCH y
 * conserva croma, tono y alfa.
 *
 * No es un resultado final y la UI tiene que decirlo. La inversión acierta con
 * los neutros y con la mayoría de los acentos, pero un par fondo/texto que ya
 * iba justo en claro puede quedar peor en oscuro — de ahí el panel de contraste.
 *
 * Un token que no se puede interpretar se copia tal cual en vez de perderse.
 */
export const deriveDarkVariant = (
	light: ThemeColorTokens,
): ThemeColorTokens => {
	const derived = {} as ThemeColorTokens;

	for (const token of COLOR_TOKENS) {
		const value = light[token];
		const parsed = parseThemeColor(value ?? "");

		derived[token] = parsed
			? formatThemeColor({
					...parsed,
					l:
						DARK_LIGHTNESS.min +
						(1 - parsed.l) * (DARK_LIGHTNESS.max - DARK_LIGHTNESS.min),
				})
			: (value ?? "");
	}

	return derived;
};

// ===============================================================
// Contraste WCAG
// ===============================================================

/**
 * Qué mínimo le exige WCAG a un par, y por qué.
 *
 * - `text`: texto normal. AA pide 4.5:1 (1.4.3). "Solo texto grande" (3:1) NO
 *   cuenta como cumplir: en esta interfaz casi todo el texto es de 14 px.
 * - `ui`: información NO textual que hace falta para identificar un control o su
 *   estado — el anillo de foco, el borde de un campo. 1.4.11 pide 3:1.
 * - `info`: se mide y se enseña, pero no hay mínimo que exigir. El par es
 *   decorativo y convertirlo en aviso sería ruido.
 */
export type ContrastUsage = "text" | "ui" | "info";

export const CONTRAST_MINIMUM: Record<ContrastUsage, number | null> = {
	text: 4.5,
	ui: 3,
	info: null,
};

export interface ContrastPair {
	/** Superficie de debajo. */
	background: ColorTokenName;
	/** Lo que se pinta encima: texto, borde o indicador. */
	foreground: ColorTokenName;
	/**
	 * Opacidad de la capa del PROPIO `foreground` que hace de fondo real.
	 *
	 * El botón destructivo es `bg-destructive/10 text-destructive`: su fondo no es
	 * ningún token liso, sino el rojo al 10% sobre el fondo de la página. Medir
	 * contra `background` a secas daría un número parecido, pero no el que se ve.
	 */
	tint?: number;
	usage: ContrastUsage;
	/** Dónde se ve en la aplicación. El nombre del token no lo dice. */
	label: string;
}

/**
 * Pares que la interfaz combina DE VERDAD.
 *
 * Se derivan del código, no de la lista de tokens. La versión anterior hacía lo
 * contrario y fallaba en las dos direcciones: alarmaba por
 * `destructive / destructive-foreground` —que ningún componente pinta— y callaba
 * el par real del botón destructivo, el del texto secundario y el del anillo de
 * foco.
 *
 * `destructive-foreground` sigue existiendo como TOKEN (tweakcn y el generador de
 * shadcn lo dan por hecho al importar), pero ya no se mide: nada lo consume.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
	// ── Texto sobre superficies ──────────────────────────────────────────────
	{
		background: "background",
		foreground: "foreground",
		usage: "text",
		label: "Texto principal",
	},
	{
		background: "background",
		foreground: "muted-foreground",
		usage: "text",
		label: "Texto secundario",
	},
	{
		background: "card",
		foreground: "card-foreground",
		usage: "text",
		label: "Texto sobre tarjeta",
	},
	{
		background: "card",
		foreground: "muted-foreground",
		usage: "text",
		label: "Texto secundario en tarjeta",
	},
	{
		background: "popover",
		foreground: "popover-foreground",
		usage: "text",
		label: "Menús y desplegables",
	},
	{
		background: "muted",
		foreground: "muted-foreground",
		usage: "text",
		label: "Texto sobre superficie apagada",
	},

	// ── Marca y acciones ─────────────────────────────────────────────────────
	{
		background: "primary",
		foreground: "primary-foreground",
		usage: "text",
		label: "Botón primario",
	},
	{
		background: "background",
		foreground: "primary",
		usage: "text",
		label: "Enlaces y texto de marca",
	},
	{
		background: "secondary",
		foreground: "secondary-foreground",
		usage: "text",
		label: "Botón secundario",
	},
	{
		background: "accent",
		foreground: "accent-foreground",
		usage: "text",
		label: "Fila resaltada (hover, activo)",
	},

	// ── Estado ───────────────────────────────────────────────────────────────
	{
		background: "background",
		foreground: "destructive",
		tint: 0.1,
		usage: "text",
		label: "Botón y texto destructivo",
	},
	{
		background: "success",
		foreground: "success-foreground",
		usage: "text",
		label: "Distintivo de éxito",
	},
	{
		background: "warning",
		foreground: "warning-foreground",
		usage: "text",
		label: "Distintivo de aviso",
	},

	// ── Barra lateral ────────────────────────────────────────────────────────
	{
		background: "sidebar",
		foreground: "sidebar-foreground",
		usage: "text",
		label: "Texto de la barra lateral",
	},
	{
		background: "sidebar-primary",
		foreground: "sidebar-primary-foreground",
		usage: "text",
		label: "Elemento activo de la barra lateral",
	},
	{
		background: "sidebar-accent",
		foreground: "sidebar-accent-foreground",
		usage: "text",
		label: "Elemento en hover de la barra lateral",
	},

	// ── Elementos de interfaz: WCAG 1.4.11, mínimo 3:1 ───────────────────────
	{
		background: "background",
		foreground: "ring",
		usage: "ui",
		label: "Anillo de foco",
	},
	{
		background: "background",
		foreground: "input",
		usage: "ui",
		label: "Borde de los campos",
	},
	{
		background: "sidebar",
		foreground: "sidebar-ring",
		usage: "ui",
		label: "Anillo de foco en la barra lateral",
	},

	// ── Informativo: se mide, no se exige ────────────────────────────────────
	{
		background: "background",
		foreground: "border",
		usage: "info",
		label: "Bordes y separadores",
	},
	{
		background: "card",
		foreground: "border",
		usage: "info",
		label: "Borde de las tarjetas",
	},
];

export type ContrastLevel = "AAA" | "AA" | "AA-large" | "fail";

export interface ContrastResult extends ContrastPair {
	/** `null` si alguno de los dos colores no se pudo interpretar. */
	ratio: number | null;
	level: ContrastLevel | null;
	/**
	 * Cumple el mínimo de SU uso. `null` cuando no hay mínimo (`info`) o cuando no
	 * se pudo medir — nunca `false` por falta de datos.
	 */
	passes: boolean | null;
}

/** Color sRGB ya compuesto, sin alfa, listo para medir. */
interface FlatRgb {
	mode: "rgb";
	r: number;
	g: number;
	b: number;
}

/**
 * Compone un color sobre el fondo que tiene debajo.
 *
 * Medir un color CON ALFA contra su fondo es medir algo que nadie ve: `border`
 * en oscuro es blanco al 10% y daría 19,79:1, cuando lo que aparece en pantalla
 * contrasta 1,26:1. WCAG mide colores ya compuestos, así que hay que componerlos
 * antes — en sRGB, que es donde lo hace el navegador.
 *
 * `null` cuando el color no se puede interpretar, o cuando es translúcido y no
 * hay fondo conocido sobre el que apoyarlo: un "sin medir" honesto es mejor que
 * un número inventado.
 */
const flatten = (
	value: string,
	backdrop: FlatRgb | null,
	alphaOverride?: number,
): FlatRgb | null => {
	const top = toRgb(value.trim());
	if (!top) return null;

	const alpha = alphaOverride ?? top.alpha ?? 1;
	if (alpha >= 1) return { mode: "rgb", r: top.r, g: top.g, b: top.b };
	if (!backdrop) return null;

	const mix = (over: number, under: number) =>
		over * alpha + under * (1 - alpha);

	return {
		mode: "rgb",
		r: mix(top.r, backdrop.r),
		g: mix(top.g, backdrop.g),
		b: mix(top.b, backdrop.b),
	};
};

/**
 * Ratio WCAG 2.1 entre dos colores, componiendo antes el alfa del de delante.
 *
 * El cálculo lo hace `culori` (decisión #13): la luminancia relativa exige
 * linearizar sRGB con la curva correcta, y escribirlo a mano es una fuente
 * conocida de resultados que se parecen a los buenos sin serlo.
 */
export const contrastRatio = (
	background: string,
	foreground: string,
): number | null => {
	const base = flatten(background, null);
	const front = flatten(foreground, base);
	if (!base || !front) return null;

	return round(wcagContrast(base, front), 2);
};

/** Umbrales de WCAG 2.1 para texto. */
export const contrastLevel = (ratio: number): ContrastLevel => {
	if (ratio >= 7) return "AAA";
	if (ratio >= 4.5) return "AA";
	if (ratio >= 3) return "AA-large";
	return "fail";
};

/**
 * Informe de contraste de una variante.
 *
 * AVISA; no bloquea publicar (decisión #11: el admin manda). Existe para que
 * nadie publique un tema ilegible sin haberlo sabido, no para impedírselo.
 *
 * Cada superficie se resuelve antes contra `background`: una tarjeta translúcida
 * o el `bg-destructive/10` del botón destructivo se miden por el color que de
 * verdad acaba en pantalla.
 */
export const evaluateContrast = (
	colors: ThemeColorTokens,
): ContrastResult[] => {
	const page = flatten(colors.background ?? "", null);

	return CONTRAST_PAIRS.map((pair) => {
		const surface = flatten(colors[pair.background] ?? "", page);
		const backdrop =
			pair.tint === undefined
				? surface
				: flatten(colors[pair.foreground] ?? "", surface, pair.tint);
		const front = flatten(colors[pair.foreground] ?? "", backdrop);

		const ratio =
			backdrop && front ? round(wcagContrast(backdrop, front), 2) : null;
		const minimum = CONTRAST_MINIMUM[pair.usage];

		return {
			...pair,
			ratio,
			level: ratio === null ? null : contrastLevel(ratio),
			passes: ratio === null || minimum === null ? null : ratio >= minimum,
		};
	});
};

// ===============================================================
// Medidas: rango único y aviso de densidad
// ===============================================================

/**
 * Rango admisible de cada medida del tema, en un solo sitio.
 *
 * Las tres puertas por las que entra un valor —el slider del builder, el
 * validador del servidor y el CSS pegado— leen esta tabla. Antes el rango vivía
 * duplicado en el panel y en el validador, y no coincidían: el slider del grosor
 * de borde llegaba a 4 px y el validador aceptaba 8, así que "lo que se puede
 * elegir" y "lo que se puede guardar" eran dos cosas distintas según por dónde
 * entrara el valor.
 *
 * `step` vive aquí por el mismo motivo: es parte de la definición de la medida,
 * no de la presentación.
 */
export const LENGTH_RANGES = {
	radius: { unit: "rem", min: 0, max: 2, step: 0.025 },
	borderWidth: { unit: "px", min: 0, max: 4, step: 0.5 },
	/*
	 * El suelo no es estético: `--spacing` también multiplica `h-*`, `w-*` y
	 * `size-*` en Tailwind v4. Por debajo de 0,2 rem el botón pequeño mide menos
	 * que su propio texto y el icono más pequeño del kit baja de 20 px. De 0,2 a
	 * 0,25 sigue siendo estrecho pero utilizable, y `evaluateDensity` lo avisa.
	 */
	spacing: { unit: "rem", min: 0.2, max: 0.5, step: 0.01 },
	/*
	 * El tamaño base ya no se queda en `body`: `--text-xs … --text-5xl` se
	 * derivan de él (ver app.css), así que mueve toda la escala. Con el rango
	 * antiguo —0,75 a 1,5 rem— eso dejaba etiquetas de 9 px en un extremo y
	 * texto de cuerpo de 24 px en el otro. 0,875–1,25 rem es el rango en el que
	 * una interfaz de trabajo sigue siendo una interfaz de trabajo.
	 */
	fontSize: { unit: "rem", min: 0.875, max: 1.25, step: 0.0625 },
	letterSpacing: { unit: "em", min: -0.05, max: 0.2, step: 0.005 },
} as const;

export type LengthTokenName = keyof typeof LENGTH_RANGES;

/**
 * Recorta una medida a su rango. `null` si no es una medida en la unidad del
 * token.
 *
 * Lo usa el importador de CSS: es "tolerante por diseño", y pasar un valor
 * fuera de rango tal cual lo dejaba de ser — el borrador se llenaba con algo
 * que el servidor iba a rechazar al guardar, con el aviso apareciendo un
 * segundo después y sin decir qué línea del CSS pegado lo causó.
 */
export const clampLength = (
	token: LengthTokenName,
	value: string,
): string | null => {
	const { unit, min, max } = LENGTH_RANGES[token];
	const match = new RegExp(`^(-?\\d+(?:\\.\\d+)?)${unit}$`).exec(value.trim());
	if (!match?.[1]) return null;

	return `${round(Math.min(max, Math.max(min, Number(match[1]))), 4)}${unit}`;
};

/**
 * Referencia en píxeles del `rem`.
 *
 * Es el valor por defecto del navegador. Quien cambie el tamaño de fuente base
 * del suyo verá otros números, y está bien: el aviso se calcula sobre el caso
 * normal, igual que el mínimo de 24 px de WCAG está escrito en píxeles CSS.
 */
const ROOT_FONT_PX = 16;

/** Alto en px de una utilidad de N pasos (`h-6`, `size-9`) con este espaciado. */
export const spacingSteps = (spacingRem: number, steps: number): number =>
	round(steps * spacingRem * ROOT_FONT_PX, 1);

/** El control más pequeño del kit: `size-6` de `icon-xs` y `h-6` del botón `xs`. */
const SMALLEST_CONTROL_STEPS = 6;

/** WCAG 2.5.8 (AA): 24×24 px de objetivo mínimo para el puntero. */
const MIN_TARGET_PX = 24;

export interface DensityIssue {
	id: "target-size" | "control-height";
	/** El problema, con el número que lo demuestra. */
	title: string;
	/** Qué mover para salir de ahí. */
	detail: string;
}

/**
 * Aviso de densidad: el equivalente del panel de contraste para las medidas.
 *
 * El espaciado y el tamaño base se editan por separado pero chocan en el mismo
 * píxel —el alto de un control sale de `--spacing` y su texto de `--font-size`—,
 * así que ninguno de los dos sliders puede avisar por su cuenta. Avisa; no
 * bloquea, igual que el contraste.
 */
export const evaluateDensity = ({
	spacing,
	fontSize,
}: Pick<ThemeSharedTokens, "spacing" | "fontSize">): DensityIssue[] => {
	const step = Number.parseFloat(spacing);
	const base = Number.parseFloat(fontSize);
	if (!Number.isFinite(step) || !Number.isFinite(base)) return [];

	const control = spacingSteps(step, SMALLEST_CONTROL_STEPS);
	// `text-xs` tiene un interlineado de `calc(1 / 0.75)` sobre un tamaño de
	// `0.75em`: su caja de línea mide exactamente el tamaño base.
	const line = round(base * ROOT_FONT_PX, 1);
	const issues: DensityIssue[] = [];

	if (control < MIN_TARGET_PX) {
		const safe = round(
			MIN_TARGET_PX / (SMALLEST_CONTROL_STEPS * ROOT_FONT_PX),
			3,
		);
		issues.push({
			id: "target-size",
			title: `Los botones de icono pequeños quedan en ${control} px`,
			detail: `WCAG 2.5.8 pide 24 px de objetivo. Sube el espaciado a ${safe} rem o más.`,
		});
	}

	if (control < line) {
		issues.push({
			id: "control-height",
			title: `El botón pequeño (${control} px) es más bajo que su texto (${line} px)`,
			detail:
				"El texto se sale del control. Sube el espaciado o baja el tamaño base.",
		});
	}

	return issues;
};

// ===============================================================
// Escala de sombras
// ===============================================================

/**
 * Cómo se abre la escala a partir de los parámetros que edita el admin.
 *
 * `blur` y `offset` multiplican los valores base; `alpha` multiplica la
 * opacidad. Los pasos con `layered` añaden una segunda capa más corta, que es lo
 * que separa una sombra de material de una mancha difusa.
 *
 * Los factores son una elección de diseño, no un estándar: se documentan aquí
 * para que cambiarlos sea una decisión y no un accidente.
 */
const SHADOW_STEPS = [
	{ name: "2xs", blur: 0.5, offset: 0.5, alpha: 0.5, layered: false },
	{ name: "xs", blur: 0.75, offset: 0.75, alpha: 0.5, layered: false },
	{ name: "sm", blur: 1, offset: 1, alpha: 1, layered: true },
	{ name: "", blur: 1, offset: 1, alpha: 1, layered: true },
	{ name: "md", blur: 1.5, offset: 1.5, alpha: 1, layered: true },
	{ name: "lg", blur: 2.5, offset: 2.5, alpha: 1, layered: true },
	{ name: "xl", blur: 4, offset: 4, alpha: 1, layered: true },
	{ name: "2xl", blur: 6, offset: 6, alpha: 2.5, layered: false },
] as const;

const shadowColor = (
	shadow: ThemeShadowTokens,
	alphaFactor: number,
): string => {
	const parsed = parseThemeColor(shadow.color);
	const alpha = Math.min(1, Math.max(0, shadow.opacity * alphaFactor));

	// Sin color interpretable la sombra se apaga en vez de romper la hoja: una
	// sombra ausente es un defecto visual, un valor inválido tumba la regla entera.
	if (!parsed) return "transparent";

	return formatThemeColor({ ...parsed, alpha });
};

/**
 * `--shadow-2xs … --shadow-2xl` a partir de los seis parámetros.
 *
 * El admin edita color, opacidad, blur, spread y offset; la escala se deriva.
 * Editar los ocho pasos a mano daría más control y garantizaría escalas
 * incoherentes.
 */
export const deriveShadowScale = (
	shadow: ThemeShadowTokens,
): Record<string, string> => {
	const scale: Record<string, string> = {};

	for (const step of SHADOW_STEPS) {
		const color = shadowColor(shadow, step.alpha);
		const x = round(shadow.offsetX, 2);
		const y = round(shadow.offsetY * step.offset, 2);
		const blur = round(shadow.blur * step.blur, 2);
		const spread = round(shadow.spread, 2);

		const primary = `${x}px ${y}px ${blur}px ${spread}px ${color}`;
		const secondary = step.layered
			? `, ${x}px ${round(y * 0.5, 2)}px ${round(blur * 0.5, 2)}px ${spread}px ${color}`
			: "";

		scale[step.name ? `shadow-${step.name}` : "shadow"] =
			`${primary}${secondary}`;
	}

	return scale;
};

// ===============================================================
// Resolución del modo efectivo
// ===============================================================

export type ThemeMode = (typeof THEME_MODES)[number];

/** `true` si el valor es uno de los modos conocidos. */
export const isThemeMode = (value: unknown): value is ThemeMode =>
	typeof value === "string" && THEME_MODES.includes(value as ThemeMode);

/**
 * Modo efectivo a partir de las dos fuentes persistidas.
 *
 * La COOKIE gana sobre la columna del usuario, y el orden importa: la cookie es
 * lo único disponible para peticiones anónimas, así que si la columna tuviera
 * precedencia la misma persona vería un tema en la landing y otro tras entrar.
 * La columna existe para sembrar la cookie en un dispositivo nuevo, no para
 * discutirle la preferencia local.
 *
 * Valores basura (cookie manipulada, columna de una versión anterior) se ignoran
 * en vez de fallar: el peor desenlace posible aquí es pintar el tema por defecto.
 */
export const resolveThemeMode = (
	cookieMode: unknown,
	userMode: unknown,
): ThemeMode => {
	if (isThemeMode(cookieMode)) return cookieMode;
	if (isThemeMode(userMode)) return userMode;
	return "system";
};

/**
 * Clase que va en `<html>`.
 *
 * Con `system` NO se emite `dark`: el esquema lo decide el `@media` que emite
 * `serializeThemeCss`. La clase `theme-system` existe para que el custom variant
 * `dark:` de Tailwind pueda engancharse a ese caso (ver app.css).
 */
export const themeHtmlClass = (mode: ThemeMode): string => {
	if (mode === "dark") return "dark";
	if (mode === "system") return "theme-system";
	return "";
};

/** Valor de `color-scheme`: gobierna scrollbars y controles nativos del sistema. */
const colorSchemeFor = (mode: ThemeMode): string =>
	mode === "system" ? "light dark" : mode;

// ===============================================================
// Serialización a CSS
// ===============================================================

/**
 * Nombre de custom property admisible (sin el `--`).
 *
 * El CSS se inyecta con `dangerouslySetInnerHTML` y los tokens vienen ya de la
 * base de datos: un nombre o un valor con `</style>` cerraría la etiqueta y
 * convertiría el tema en un vector de XSS. La allowlist de nombres es la segunda
 * línea —la primera es que `toCssTokenSet` recorre `COLOR_TOKENS` y no las
 * claves de la fila—, pero un fallo de una sola de las dos no debe bastar.
 */
const SAFE_TOKEN_NAME = /^[a-z0-9-]+$/;

/**
 * Valor admisible: descarta los caracteres con los que se sale de una
 * declaración CSS o de la propia etiqueta `<style>`.
 */
const UNSAFE_VALUE_CHARS = /[<>;{}\\]/;

const isSafeToken = ([name, value]: [string, string]): boolean =>
	SAFE_TOKEN_NAME.test(name) && !UNSAFE_VALUE_CHARS.test(value);

const declarations = (variant: Record<string, string>): string =>
	Object.entries(variant)
		.filter(isSafeToken)
		.map(([name, value]) => `--${name}:${value}`)
		.join(";");

/**
 * CSS del tema para el modo pedido. Es lo que se inyecta en el `<head>`.
 *
 * La forma cambia según el modo, y ahí está el truco que elimina el flash sin
 * una línea de JavaScript:
 *
 * - `light` / `dark`: el servidor ya sabe qué variante toca y emite solo esa.
 * - `system`: emite la clara y deja que un `@media (prefers-color-scheme: dark)`
 *   pise los tokens. El servidor no puede conocer el ajuste del sistema
 *   operativo del cliente, pero el motor de CSS sí — y además responde a un
 *   cambio del sistema EN VIVO, sin recargar.
 *
 * La alternativa habitual (script bloqueante en el `<head>` que lee el modo y
 * pone la clase antes del primer pintado, estilo next-themes) sobra aquí: el
 * servidor ya tiene la cookie.
 */
export const serializeThemeCss = (
	tokens: ThemeTokenSet,
	mode: ThemeMode,
	selector = ":root",
): string => {
	const base = declarations(tokens.shared);
	const scheme = `color-scheme:${colorSchemeFor(mode)}`;

	if (mode === "dark") {
		return `${selector}{${scheme};${base};${declarations(tokens.dark)}}`;
	}

	const light = `${selector}{${scheme};${base};${declarations(tokens.light)}}`;

	if (mode === "light") return light;

	return `${light}@media (prefers-color-scheme:dark){${selector}{${declarations(tokens.dark)}}}`;
};

// ===============================================================
// Invariantes de la biblioteca
// ===============================================================

/**
 * Un preset de fábrica no se edita ni se borra: se clona.
 *
 * La invariante vive AQUÍ y no solo en la UI. Ocultar el botón no impide un
 * `POST` a mano, y la biblioteca de presets es lo único a lo que se puede
 * volver cuando un tema publicado sale mal.
 */
export const assertThemeEditable = (theme: {
	documentId: string;
	isPreset: boolean;
}): void => {
	if (theme.isPreset) {
		throw new ThemePresetImmutableError(theme.documentId);
	}
};

/**
 * El tema que la plataforma está sirviendo no se borra.
 *
 * La FK es `onDelete: SetNull`, así que la base aguantaría — pero dejaría la
 * plataforma sin tema activo por un clic, y eso es una decisión, no un descuido.
 */
export const assertThemeDeletable = (
	theme: { documentId: string; isPreset: boolean },
	activeThemeDocumentId: string | null,
): void => {
	assertThemeEditable(theme);

	if (theme.documentId === activeThemeDocumentId) {
		throw new ThemeActiveCannotBeDeletedError(theme.documentId);
	}
};

/**
 * Solo se puede activar —y solo se puede descartar el borrador de— un tema que
 * ya se publicó alguna vez.
 *
 * Activar uno sin publicar dejaría a la app sirviendo tokens en edición; y
 * descartar sin publicado no tiene a dónde volver.
 *
 * Se declara como `asserts` y no como un simple `void` para que quien llame no
 * tenga que escribir un `?? algo` detrás "para el compilador": ese respaldo
 * nunca se ejecutaría y solo serviría para esconder que la garantía ya estaba
 * dada aquí.
 */
export function assertThemePublished<T extends { publishedTokens: unknown }>(
	theme: T & { documentId: string },
): asserts theme is T & {
	documentId: string;
	publishedTokens: NonNullable<T["publishedTokens"]>;
} {
	if (theme.publishedTokens === null || theme.publishedTokens === undefined) {
		throw new ThemeNeverPublishedError(theme.documentId);
	}
}

// ===============================================================
// Esquemas de entrada
// ===============================================================

export const themeModeRule = v.picklist(THEME_MODES);

/** Entrada del action del toggle. Un solo campo, pero se valida igual. */
export const setThemeModeRule = v.object({
	mode: themeModeRule,
});

export const themeDocumentIdRule = v.pipe(v.string(), v.uuid());

export const themeNameRule = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "El nombre del tema no puede estar vacío."),
	v.maxLength(60, "El nombre del tema no puede pasar de 60 caracteres."),
);

/**
 * Un color admisible es uno que el navegador va a saber pintar, y lo que se
 * guarda es SIEMPRE su forma canónica en OKLCH.
 *
 * Se comprueba interpretándolo de verdad y no con una expresión regular: la
 * sintaxis de color de CSS es demasiado ancha para una regex honesta, y un token
 * que pasa el filtro pero no pinta deja al tema con un hueco silencioso.
 *
 * El `transform` final es lo que cierra el agujero de verdad: validar no era
 * normalizar. `oklch(0.5 0.1 20` —sin cerrar— se interpreta bien, pasaba la
 * validación y llegaba tal cual al `<style>`; y una función CSS sin cerrar se
 * come el resto de la hoja, así que se llevaba por delante los tokens siguientes
 * y el bloque `@media` de oscuro, sin valores de respaldo en `app.css`.
 * Reescribir siempre la salida de `formatThemeColor` hace que eso no se pueda
 * persistir, venga del builder o de un CSS pegado.
 */
const themeColorRule = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(64),
	v.check(isThemeColor, "Ese valor no es un color que el navegador entienda."),
	v.transform(normalizeThemeColor),
);

/**
 * Longitud CSS acotada: rechaza `calc()`, `var()` y cualquier cosa con
 * paréntesis.
 *
 * El rango sale de `LENGTH_RANGES`, el mismo que dibuja el slider y recorta el
 * importador: el servidor no acepta nada que el builder no pueda ofrecer.
 */
const lengthRule = (token: LengthTokenName) => {
	const { unit, min, max } = LENGTH_RANGES[token];

	return v.pipe(
		v.string(),
		v.trim(),
		v.regex(
			new RegExp(`^-?\\d+(\\.\\d+)?${unit}$`),
			`Se espera una medida en ${unit}.`,
		),
		v.check((value) => {
			const amount = Number.parseFloat(value);
			return amount >= min && amount <= max;
		}, `Se espera un valor entre ${min}${unit} y ${max}${unit}.`),
	);
};

const fontFamilyRule = v.picklist(FONT_FAMILY_KEYS);

export const themeShadowRule = v.object({
	color: themeColorRule,
	opacity: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	blur: v.pipe(v.number(), v.minValue(0), v.maxValue(64)),
	spread: v.pipe(v.number(), v.minValue(-16), v.maxValue(16)),
	offsetX: v.pipe(v.number(), v.minValue(-32), v.maxValue(32)),
	offsetY: v.pipe(v.number(), v.minValue(-32), v.maxValue(32)),
});

export const themeSharedTokensRule = v.object({
	radius: lengthRule("radius"),
	borderWidth: lengthRule("borderWidth"),
	spacing: lengthRule("spacing"),
	fontSans: fontFamilyRule,
	fontSerif: fontFamilyRule,
	fontMono: fontFamilyRule,
	fontHeading: fontFamilyRule,
	fontSize: lengthRule("fontSize"),
	letterSpacing: lengthRule("letterSpacing"),
	shadow: themeShadowRule,
});

/**
 * Los 36 colores, todos obligatorios.
 *
 * Exigir el conjunto COMPLETO es deliberado: un tema al que le falta un token
 * hereda el del tema anterior y produce combinaciones que nadie eligió. Quien
 * importa un tema incompleto (CSS pegado, JSON de otra versión) lo completa
 * antes en el mapper, contra el tema base.
 */
export const themeColorTokensRule = v.object(
	Object.fromEntries(
		COLOR_TOKENS.map((token) => [token, themeColorRule]),
	) as Record<ColorTokenName, typeof themeColorRule>,
);

export const themeTokensRule = v.object({
	shared: themeSharedTokensRule,
	light: themeColorTokensRule,
	dark: themeColorTokensRule,
});

export const createThemeRule = v.object({
	name: themeNameRule,
	fromDocumentId: v.optional(themeDocumentIdRule),
});

export const renameThemeRule = v.object({
	documentId: themeDocumentIdRule,
	name: themeNameRule,
});

export const cloneThemeRule = v.object({
	documentId: themeDocumentIdRule,
	name: themeNameRule,
});

export const saveDraftRule = v.object({
	documentId: themeDocumentIdRule,
	tokens: themeTokensRule,
});

export const themeTargetRule = v.object({
	documentId: themeDocumentIdRule,
});

/** Bloque CSS pegado desde tweakcn o el generador de shadcn. */
export const importThemeCssRule = v.object({
	documentId: themeDocumentIdRule,
	css: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Pega el CSS del tema."),
		v.maxLength(20_000, "Ese bloque de CSS es demasiado grande."),
	),
});

export const themeRules = {
	setMode: setThemeModeRule,
	create: createThemeRule,
	clone: cloneThemeRule,
	rename: renameThemeRule,
	saveDraft: saveDraftRule,
	target: themeTargetRule,
	importCss: importThemeCssRule,
	tokens: themeTokensRule,
} as const;
