import {
	DEFAULT_THEME_TOKENS,
	FONT_CATALOG,
	THEME_TOKENS_SCHEMA_VERSION,
} from "./theme.config";
import { ThemeCssNotParseableError } from "./theme.errors";
import {
	COLOR_TOKENS,
	type ColorTokenName,
	clampLength,
	deriveShadowScale,
	FONT_FAMILY_KEYS,
	type FontFamilyKey,
	type LengthTokenName,
	normalizeThemeColor,
	serializeThemeCss,
	type ThemeColorTokens,
	type ThemeMode,
	type ThemeSharedTokens,
	type ThemeTokenSet,
	type ThemeTokens,
} from "./theme.rules";
import { safeParseThemeTokens } from "./theme.validators";

// ===============================================================
// Dominio → custom properties
// ===============================================================

/**
 * Prefijo de las custom properties que NO son colores.
 *
 * Existe para no chocar con las que Tailwind emite por su cuenta: `--spacing`,
 * `--font-sans` y la escala `--shadow-*` son claves de SU tema, y declararlas
 * también en `:root` es una carrera de cascada que se pierde según el orden de
 * las hojas. Con el prefijo, `app.css` las conecta explícitamente en su bloque
 * `@theme inline` (`--spacing: var(--theme-spacing)`), que es el mismo mecanismo
 * con el que shadcn conecta `--color-primary` a `--primary`.
 *
 * Los COLORES no lo llevan: sus nombres (`--primary`, `--sidebar-border`) son el
 * contrato de shadcn y no colisionan con nada.
 */
const SHARED_PREFIX = "theme-";

/** Pila de `font-family` de una clave del catálogo. */
export const fontStack = (key: FontFamilyKey): string =>
	FONT_CATALOG[key]?.stack ?? FONT_CATALOG.system.stack;

/**
 * Expande el modelo editable a las custom properties que se escriben en el
 * `<style>`.
 *
 * Aquí ocurren las tres traducciones que el builder no debe conocer: la clave
 * del catálogo se convierte en una pila real, los seis parámetros de sombra se
 * convierten en la escala de ocho pasos, y los colores se filtran contra
 * `COLOR_TOKENS`.
 *
 * Recorrer la ALLOWLIST en vez de las claves del objeto es deliberado: los
 * tokens vienen de una columna `Json` de la base de datos, así que una fila con
 * claves inventadas no puede meter nombres nuevos en la hoja de estilos.
 */
export const toCssTokenSet = (tokens: ThemeTokens): ThemeTokenSet => {
	const { shared } = tokens;

	const sharedVars: Record<string, string> = {
		radius: shared.radius,
		[`${SHARED_PREFIX}spacing`]: shared.spacing,
		[`${SHARED_PREFIX}border-width`]: shared.borderWidth,
		[`${SHARED_PREFIX}font-sans`]: fontStack(shared.fontSans),
		[`${SHARED_PREFIX}font-serif`]: fontStack(shared.fontSerif),
		[`${SHARED_PREFIX}font-mono`]: fontStack(shared.fontMono),
		[`${SHARED_PREFIX}font-heading`]: fontStack(shared.fontHeading),
		[`${SHARED_PREFIX}font-size`]: shared.fontSize,
		[`${SHARED_PREFIX}tracking`]: shared.letterSpacing,
	};

	for (const [step, value] of Object.entries(
		deriveShadowScale(shared.shadow),
	)) {
		sharedVars[`${SHARED_PREFIX}${step}`] = value;
	}

	const variant = (colors: ThemeColorTokens): Record<string, string> => {
		const out: Record<string, string> = {};
		for (const token of COLOR_TOKENS) {
			const value = colors[token];
			if (typeof value === "string") out[token] = value;
		}
		return out;
	};

	return {
		shared: sharedVars,
		light: variant(tokens.light),
		dark: variant(tokens.dark),
	};
};

/**
 * Tokens → hoja de estilos lista para el `<head>`.
 *
 * Punto único: loader raíz, respaldo de `Layout` y preview del builder pasan
 * todos por aquí, así que ninguno puede desviarse de lo que emiten los otros.
 */
export const themeCss = (
	tokens: ThemeTokens,
	mode: ThemeMode,
	selector?: string,
): string => serializeThemeCss(toCssTokenSet(tokens), mode, selector);

// ===============================================================
// Exportar a CSS (interoperabilidad)
// ===============================================================

/**
 * Nombres con los que se EXPORTA, que no son los que se inyectan.
 *
 * El `<style>` de la app usa `--theme-*` para no pelearse con Tailwind; el CSS
 * que el admin copia usa los nombres de tweakcn y del generador de shadcn,
 * porque su destino es justamente pegarlo ahí. La ida y la vuelta siguen
 * cuadrando: el parser de abajo lee estos mismos nombres.
 */
const EXPORT_NAMES = {
	radius: "--radius",
	spacing: "--spacing",
	borderWidth: "--border-width",
	fontSans: "--font-sans",
	fontSerif: "--font-serif",
	fontMono: "--font-mono",
	fontHeading: "--font-heading",
	fontSize: "--font-size",
	letterSpacing: "--letter-spacing",
	shadowColor: "--shadow-color",
	shadowOpacity: "--shadow-opacity",
	shadowBlur: "--shadow-blur",
	shadowSpread: "--shadow-spread",
	shadowOffsetX: "--shadow-offset-x",
	shadowOffsetY: "--shadow-offset-y",
} as const;

const block = (selector: string, lines: string[]): string =>
	`${selector} {\n${lines.map((line) => `  ${line}`).join("\n")}\n}`;

const colorLines = (colors: ThemeColorTokens): string[] =>
	COLOR_TOKENS.map((token) => `--${token}: ${colors[token]};`);

const sharedLines = (shared: ThemeSharedTokens): string[] => {
	const { shadow } = shared;

	return [
		`${EXPORT_NAMES.radius}: ${shared.radius};`,
		`${EXPORT_NAMES.spacing}: ${shared.spacing};`,
		`${EXPORT_NAMES.borderWidth}: ${shared.borderWidth};`,
		`${EXPORT_NAMES.fontSans}: ${fontStack(shared.fontSans)};`,
		`${EXPORT_NAMES.fontSerif}: ${fontStack(shared.fontSerif)};`,
		`${EXPORT_NAMES.fontMono}: ${fontStack(shared.fontMono)};`,
		`${EXPORT_NAMES.fontHeading}: ${fontStack(shared.fontHeading)};`,
		`${EXPORT_NAMES.fontSize}: ${shared.fontSize};`,
		`${EXPORT_NAMES.letterSpacing}: ${shared.letterSpacing};`,
		`${EXPORT_NAMES.shadowColor}: ${shadow.color};`,
		`${EXPORT_NAMES.shadowOpacity}: ${shadow.opacity};`,
		`${EXPORT_NAMES.shadowBlur}: ${shadow.blur}px;`,
		`${EXPORT_NAMES.shadowSpread}: ${shadow.spread}px;`,
		`${EXPORT_NAMES.shadowOffsetX}: ${shadow.offsetX}px;`,
		`${EXPORT_NAMES.shadowOffsetY}: ${shadow.offsetY}px;`,
		// La escala derivada va también, para quien pegue esto en una app que no
		// sea ésta. Al leerlo de vuelta se ignora: aquí manda el parámetro.
		...Object.entries(deriveShadowScale(shadow)).map(
			([step, value]) => `--${step}: ${value};`,
		),
	];
};

/** Bloque `:root { … } .dark { … }` para copiar al portapapeles. */
export const exportThemeCss = (tokens: ThemeTokens): string =>
	[
		block(":root", [
			...sharedLines(tokens.shared),
			...colorLines(tokens.light),
		]),
		block(".dark", colorLines(tokens.dark)),
	].join("\n\n");

// ===============================================================
// Parsear CSS pegado
// ===============================================================

/** Declaraciones `--nombre: valor;` dentro de un selector concreto. */
const readBlock = (css: string, selector: string): Map<string, string> => {
	const found = new Map<string, string>();
	// El selector puede aparecer varias veces (tweakcn separa colores y sombras);
	// se acumulan todas las apariciones y gana la última, como haría el navegador.
	const blocks = css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"));

	for (const [, body] of blocks) {
		for (const [, name, value] of body.matchAll(
			/(--[a-z0-9-]+)\s*:\s*([^;]+);?/gi,
		)) {
			found.set(name.trim().toLowerCase(), value.trim());
		}
	}

	return found;
};

/**
 * Tokens mínimos para considerar que el bloque pegado ES un tema.
 *
 * Sin esto, pegar cualquier CSS produciría un "tema" idéntico al base salvo por
 * un token suelto, y el admin creería haber importado algo.
 */
const REQUIRED_TOKENS: readonly ColorTokenName[] = [
	"background",
	"foreground",
	"primary",
];

const readColors = (
	declared: Map<string, string>,
	base: ThemeColorTokens,
): ThemeColorTokens => {
	const colors = {} as ThemeColorTokens;

	for (const token of COLOR_TOKENS) {
		const value = declared.get(`--${token}`);
		// Tolerante con lo que falta y estricto con lo que llega: un token ausente
		// hereda del tema base en vez de dejar el hueco.
		colors[token] = value ? normalizeThemeColor(value) : base[token];
	}

	return colors;
};

/**
 * Reconoce la familia a partir de la pila declarada.
 *
 * Dos pasadas, y las dos hacen falta. La primera compara la pila COMPLETA con
 * las del catálogo: es la que hace exacta la ida y vuelta de nuestro propio CSS
 * exportado, incluidas las opciones "del sistema", que no tienen un nombre propio
 * que buscar. La segunda busca el nombre de la familia dentro de la pila, y es la
 * que entiende un tema pegado desde fuera (`--font-sans: Inter, sans-serif`).
 *
 * Las claves `system*` quedan fuera de la segunda pasada porque su etiqueta ("Del
 * sistema") no es un nombre de familia y no aparecería nunca en una pila. Las que
 * SÍ nombran una familia del sistema (`times-new-roman`, `courier-new`) entran en
 * la pasada como cualquier otra: es lo que reconoce un `--font-mono: "Courier
 * New", Courier, monospace` pegado desde fuera.
 */
const readFontKey = (
	declared: Map<string, string>,
	name: string,
	fallback: FontFamilyKey,
): FontFamilyKey => {
	const raw = declared.get(name);
	if (!raw) return fallback;

	const stack = raw.toLowerCase();

	const exact = FONT_FAMILY_KEYS.find(
		(key) => FONT_CATALOG[key].stack.toLowerCase() === stack,
	);
	if (exact) return exact;

	const byName = FONT_FAMILY_KEYS.find(
		(key) =>
			!key.startsWith("system") &&
			stack.includes(FONT_CATALOG[key].label.toLowerCase()),
	);

	// Una fuente fuera del catálogo NO se adopta: solo se puede ofrecer lo que
	// esta aplicación auto-hospeda (decisión #5).
	return byName ?? fallback;
};

const readNumber = (
	declared: Map<string, string>,
	name: string,
	fallback: number,
): number => {
	const raw = declared.get(name);
	if (!raw) return fallback;

	const parsed = Number.parseFloat(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Lee una medida del CSS pegado y la RECORTA a su rango.
 *
 * Recortar y no descartar: un tema de tweakcn con `--spacing: 0.2rem` sigue
 * siendo el tema que se quería importar, y el resto de sus tokens son buenos.
 * Pasarlo tal cual era lo peor de las dos opciones: el borrador quedaba con un
 * valor que el validador iba a rechazar al autoguardar, un segundo después y
 * sin poder decir qué línea del CSS lo causó.
 */
const readLength = (
	declared: Map<string, string>,
	names: readonly string[],
	token: LengthTokenName,
	fallback: string,
): string => {
	for (const name of names) {
		const raw = declared.get(name);
		const clamped = raw ? clampLength(token, raw) : null;
		if (clamped) return clamped;
	}
	return fallback;
};

/**
 * Lee un bloque `:root { … } .dark { … }` pegado desde tweakcn o desde el
 * generador de shadcn.
 *
 * TOLERANTE por diseño: ignora todo lo que no reconoce y completa lo que falta
 * con el tema base. Lo único que exige es un conjunto mínimo de colores — sin él
 * lo pegado no es un tema y decirlo es mejor que producir un clon del base.
 *
 * Sin bloque `.dark`, la variante oscura se queda como estaba: es más útil que
 * dejarla igual a la clara, y el botón "derivar oscuro" está a un clic.
 */
export const parseThemeCss = (
	css: string,
	base: ThemeTokens = DEFAULT_THEME_TOKENS,
): ThemeTokens => {
	const root = readBlock(css, ":root");
	const dark = readBlock(css, "\\.dark");

	if (root.size === 0 && dark.size === 0) {
		throw new ThemeCssNotParseableError(
			"no se encontró ningún bloque :root ni .dark",
		);
	}

	const missing = REQUIRED_TOKENS.filter((token) => !root.has(`--${token}`));
	if (missing.length > 0) {
		throw new ThemeCssNotParseableError(
			`faltan tokens obligatorios en :root (${missing.join(", ")})`,
		);
	}

	const shadow = base.shared.shadow;

	return {
		shared: {
			radius: readLength(
				root,
				[EXPORT_NAMES.radius],
				"radius",
				base.shared.radius,
			),
			spacing: readLength(
				root,
				[EXPORT_NAMES.spacing],
				"spacing",
				base.shared.spacing,
			),
			borderWidth: readLength(
				root,
				[EXPORT_NAMES.borderWidth, "--default-border-width"],
				"borderWidth",
				base.shared.borderWidth,
			),
			fontSans: readFontKey(root, EXPORT_NAMES.fontSans, base.shared.fontSans),
			fontSerif: readFontKey(
				root,
				EXPORT_NAMES.fontSerif,
				base.shared.fontSerif,
			),
			fontMono: readFontKey(root, EXPORT_NAMES.fontMono, base.shared.fontMono),
			fontHeading: readFontKey(
				root,
				EXPORT_NAMES.fontHeading,
				base.shared.fontHeading,
			),
			fontSize: readLength(
				root,
				[EXPORT_NAMES.fontSize],
				"fontSize",
				base.shared.fontSize,
			),
			letterSpacing: readLength(
				root,
				[EXPORT_NAMES.letterSpacing, "--tracking-normal"],
				"letterSpacing",
				base.shared.letterSpacing,
			),
			shadow: {
				color: normalizeThemeColor(
					root.get(EXPORT_NAMES.shadowColor) ?? shadow.color,
				),
				opacity: readNumber(root, EXPORT_NAMES.shadowOpacity, shadow.opacity),
				blur: readNumber(root, EXPORT_NAMES.shadowBlur, shadow.blur),
				spread: readNumber(root, EXPORT_NAMES.shadowSpread, shadow.spread),
				offsetX: readNumber(root, EXPORT_NAMES.shadowOffsetX, shadow.offsetX),
				offsetY: readNumber(root, EXPORT_NAMES.shadowOffsetY, shadow.offsetY),
			},
		},
		light: readColors(root, base.light),
		dark: dark.size > 0 ? readColors(dark, base.dark) : base.dark,
	};
};

// ===============================================================
// JSON de ida y vuelta
// ===============================================================

export interface ThemeTokensDocument {
	version: number;
	name: string;
	tokens: ThemeTokens;
}

export const toThemeJson = (name: string, tokens: ThemeTokens): string =>
	JSON.stringify(
		{ version: THEME_TOKENS_SCHEMA_VERSION, name, tokens },
		null,
		2,
	);

/**
 * Lee un JSON exportado. `null` si no es un documento de tema válido.
 *
 * La versión se comprueba antes que el contenido: un archivo de un esquema
 * futuro tiene que fallar por lo que es y no por qué token le falta.
 */
export const fromThemeJson = (raw: string): ThemeTokensDocument | null => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (typeof parsed !== "object" || parsed === null) return null;

	const document = parsed as Record<string, unknown>;
	if (document.version !== THEME_TOKENS_SCHEMA_VERSION) return null;

	const tokens = safeParseThemeTokens(document.tokens);
	if (!tokens) return null;

	return {
		version: THEME_TOKENS_SCHEMA_VERSION,
		name: typeof document.name === "string" ? document.name : "Tema importado",
		tokens,
	};
};

// ===============================================================
// Fila de base de datos → dominio
// ===============================================================

/**
 * Valida los tokens de una columna `Json`. `null` si no son legibles.
 *
 * Devolver `null` en vez de lanzar es la decisión importante: quien lee una fila
 * corrupta —o de un esquema de tokens anterior— no quiere una excepción, que
 * dejaría la plataforma entera sin pintar. Quiere caer al tema base y que quede
 * registrado. La caída y el log son del adaptador, que es quien tiene el logger.
 */
export const toThemeTokens = (value: unknown): ThemeTokens | null =>
	safeParseThemeTokens(value);

/**
 * Forma canónica para comparar dos juegos de tokens.
 *
 * Se recorre el orden declarado de `COLOR_TOKENS` en vez de confiar en el orden
 * de claves del objeto: dos temas idénticos guardados en momentos distintos
 * pueden traer las claves en otro orden, y `JSON.stringify` los daría por
 * distintos. Eso encendería "hay cambios sin publicar" para siempre.
 */
const canonical = (tokens: ThemeTokens): string =>
	JSON.stringify([
		tokens.shared.radius,
		tokens.shared.borderWidth,
		tokens.shared.spacing,
		tokens.shared.fontSans,
		tokens.shared.fontSerif,
		tokens.shared.fontMono,
		tokens.shared.fontHeading,
		tokens.shared.fontSize,
		tokens.shared.letterSpacing,
		tokens.shared.shadow.color,
		tokens.shared.shadow.opacity,
		tokens.shared.shadow.blur,
		tokens.shared.shadow.spread,
		tokens.shared.shadow.offsetX,
		tokens.shared.shadow.offsetY,
		COLOR_TOKENS.map((token) => tokens.light[token]),
		COLOR_TOKENS.map((token) => tokens.dark[token]),
	]);

export const tokensEqual = (a: ThemeTokens, b: ThemeTokens): boolean =>
	canonical(a) === canonical(b);

/**
 * Huella corta y estable de un juego de tokens (FNV-1a de 32 bits, base 36).
 *
 * No es criptográfica ni lo necesita: solo responde "¿es el mismo tema que el
 * navegador ya tiene guardado?" sin mandarle los tokens. Sale de `canonical`,
 * así que el orden de las claves no la altera.
 */
export const themeFingerprint = (tokens: ThemeTokens): string => {
	const text = canonical(tokens);
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
};
