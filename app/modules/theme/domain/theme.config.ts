import type {
	FontFamilyKey,
	ThemeColorTokens,
	ThemeSharedTokens,
	ThemeTokens,
} from "./theme.rules";

/**
 * Versión del esquema de tokens.
 *
 * Viaja en el JSON exportado y en el que se pega de vuelta. Hoy solo hay una
 * versión; existe para que el día que cambie la forma de `ThemeTokens` un
 * archivo antiguo se pueda reconocer como tal en vez de fallar por sorpresa.
 */
export const THEME_TOKENS_SCHEMA_VERSION = 1;

/**
 * Ventana de propagación de una publicación entre nodos.
 *
 * Mismo criterio que `AUTH_SECURITY_STATE_CACHE_TTL_S`: el tema activo se lee en
 * TODA petición y cambia casi nunca, así que se sirve de memoria. Con varios
 * procesos, publicar tarda como mucho este tiempo en verse en todos — el nodo
 * que publica invalida su copia y responde ya con el tema nuevo.
 */
export const THEME_CACHE_TTL_S = 60;

/**
 * Cada cuánto se vuelve a intentar la base mientras no responde.
 *
 * Mientras tanto se sirve el último tema conocido (memoria o snapshot en disco).
 * Sin esta ventana, cada petición esperaría el timeout de conexión de Prisma para
 * acabar sirviendo lo mismo: la caída de la base se convertiría en una plataforma
 * lenta además de desconectada.
 */
export const THEME_CACHE_RETRY_S = 5;

// ===============================================================
// Catálogo de fuentes
// ===============================================================

export interface FontFamilyDefinition {
	/** Etiqueta para el desplegable del builder. */
	label: string;
	/** Pila real que acaba en `font-family`. */
	stack: string;
	/** De dónde sale el archivo. `null` = no descarga nada. */
	source: string | null;
	category: "sans" | "serif" | "mono";
}

/**
 * Catálogo CURADO y auto-hospedado (decisión #5).
 *
 * Curado y no libre porque solo se puede ofrecer lo que el bundle realmente
 * sirve: una caja de texto libre acabaría con `font-family` apuntando a una
 * fuente que existe en la máquina del admin y en ninguna otra.
 *
 * El manual de identidad del Ayuntamiento fija ITC Avant Garde, así que es la
 * única fuente web del catálogo. Sus `@font-face` están en `app.css` y los
 * archivos en `public/font`: ninguna petición a un tercero en runtime.
 *
 * `source: null` marca las que no descargan NADA: las pilas genéricas del
 * sistema y las dos familias (Times New Roman, Courier New) que el sistema
 * operativo ya trae. Son las que permiten reproducir un tema de tweakcn que no
 * pedía una fuente web.
 *
 * Tipado como `Record<FontFamilyKey, …>`: añadir una clave a `FONT_FAMILY_KEYS`
 * sin darle entrada aquí no compila.
 */
export const FONT_CATALOG: Record<FontFamilyKey, FontFamilyDefinition> = {
	"avant-garde": {
		label: "ITC Avant Garde",
		// Arial detrás y no la sans del sistema: es la reserva que usa el propio
		// manual, y su ancho se acerca más al de Avant Garde que el de Segoe o SF.
		stack: '"ITC Avant Garde Std", Arial, ui-sans-serif, sans-serif',
		source: "public/font",
		category: "sans",
	},
	system: {
		label: "Del sistema",
		stack:
			'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
		source: null,
		category: "sans",
	},
	"system-serif": {
		label: "Del sistema (serif)",
		stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
		source: null,
		category: "serif",
	},
	"system-mono": {
		label: "Del sistema (mono)",
		stack:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		source: null,
		category: "mono",
	},
	/*
	 * Las dos de abajo NO son pilas genéricas: nombran una familia concreta que
	 * Windows y macOS traen instalada. Se catalogan igual que la institucional
	 * porque para el admin son lo mismo —una fuente con nombre que se elige del
	 * desplegable—, y no descargan nada porque ya están en la máquina.
	 *
	 * La reserva detrás del nombre es la que importa: en un Linux sin las fuentes
	 * de Microsoft, la familia no existe y se cae a `serif` / `monospace`.
	 */
	"times-new-roman": {
		label: "Times New Roman",
		stack: '"Times New Roman", Times, serif',
		source: null,
		category: "serif",
	},
	"courier-new": {
		label: "Courier New",
		stack: '"Courier New", Courier, monospace',
		source: null,
		category: "mono",
	},
};

// ===============================================================
// Tema base: identidad institucional del Ayuntamiento de Tijuana
// ===============================================================

/*
 * Colores del manual, convertidos a OKLCH desde su hexadecimal:
 *
 *   Guinda primario   #750D2F   oklch(0.367 0.136 9.47)
 *   Guinda secundario #912240   oklch(0.441 0.147 10)
 *   Rojo              #9F2240   oklch(0.467 0.16 12.76)
 *   Oro corporativo   #BA945C   oklch(0.689 0.087 76.2)
 *   Oro claro         #E3CFA7   oklch(0.861 0.057 84.49)
 *   Verde             #225B4F   oklch(0.43 0.063 177)
 *   Gris texto        #383838   oklch(0.341 0 0)
 *   Blanco roto       #F2F2F2   oklch(0.961 0 0)
 *
 * Todo lo que no es uno de estos (el guinda profundo de la barra lateral, las
 * variantes oscuras, los tonos de texto sobre fondos suaves) conserva su tono y
 * solo mueve luminosidad y croma hasta cumplir el par que le toca en
 * `CONTRAST_PAIRS`.
 */

const BASE_SHARED: ThemeSharedTokens = {
	// `--radius-sm … --radius-4xl` se derivan de `--radius` en app.css.
	radius: "0.25rem",
	borderWidth: "1px",
	spacing: "0.25rem",
	fontSans: "avant-garde",
	fontSerif: "system-serif",
	fontMono: "system-mono",
	fontHeading: "avant-garde",
	fontSize: "1rem",
	letterSpacing: "0em",
	// Reproduce la sombra por defecto de Tailwind: los valores existentes no
	// cambian de aspecto por el hecho de volverse editables.
	shadow: {
		color: "oklch(0 0 0)",
		opacity: 0.1,
		blur: 3,
		spread: 0,
		offsetX: 0,
		offsetY: 1,
	},
};

const BASE_LIGHT: ThemeColorTokens = {
	background: "oklch(0.961 0 0)",
	foreground: "oklch(0.341 0 0)",
	card: "oklch(1 0 0)",
	"card-foreground": "oklch(0.341 0 0)",
	popover: "oklch(1 0 0)",
	"popover-foreground": "oklch(0.341 0 0)",
	primary: "oklch(0.367 0.136 9.47)",
	"primary-foreground": "oklch(0.961 0 0)",
	secondary: "oklch(0.861 0.057 84.49)",
	"secondary-foreground": "oklch(0.341 0 0)",
	muted: "oklch(0.922 0 0)",
	"muted-foreground": "oklch(0.5 0 0)",
	accent: "oklch(0.689 0.087 76.2)",
	// El gris del manual se queda en 4,2 sobre el oro corporativo.
	"accent-foreground": "oklch(0.26 0 0)",
	destructive: "oklch(0.467 0.16 12.76)",
	"destructive-foreground": "oklch(0.961 0 0)",
	// `success` y `warning` son FONDOS suaves y el color con carácter va en
	// `*-foreground`, al revés que en la hoja de origen del manual.
	success: "oklch(0.923 0.015 175.7)",
	"success-foreground": "oklch(0.43 0.063 177)",
	warning: "oklch(0.943 0.022 80.69)",
	// El oro corporativo como texto daba 2,4 sobre su fondo suave.
	"warning-foreground": "oklch(0.5 0.08 76.2)",
	border: "oklch(0.88 0 0)",
	// `input` es el BORDE de campos, selects y checkboxes: lo que identifica al
	// control, y WCAG 1.4.11 le pide 3:1. `border` se queda claro: separa, no
	// identifica.
	input: "oklch(0.6 0 0)",
	ring: "oklch(0.441 0.147 10)",
	"chart-1": "oklch(0.367 0.136 9.47)",
	"chart-2": "oklch(0.689 0.087 76.2)",
	"chart-3": "oklch(0.467 0.16 12.76)",
	"chart-4": "oklch(0.43 0.063 177)",
	"chart-5": "oklch(0.25 0.045 177)",
	sidebar: "oklch(0.3 0.11 9.47)",
	"sidebar-foreground": "oklch(0.95 0 0)",
	"sidebar-primary": "oklch(0.689 0.087 76.2)",
	"sidebar-primary-foreground": "oklch(0.25 0.09 9.47)",
	"sidebar-accent": "oklch(0.367 0.136 9.47)",
	"sidebar-accent-foreground": "oklch(0.95 0 0)",
	"sidebar-border": "oklch(0.25 0.09 9.47)",
	"sidebar-ring": "oklch(0.689 0.087 76.2)",
};

const BASE_DARK: ThemeColorTokens = {
	background: "oklch(0.16 0 0)",
	foreground: "oklch(0.95 0 0)",
	card: "oklch(0.2 0 0)",
	"card-foreground": "oklch(0.95 0 0)",
	popover: "oklch(0.23 0 0)",
	"popover-foreground": "oklch(0.95 0 0)",
	/*
	 * En oscuro el primario no puede seguir siendo guinda con texto claro: el
	 * mismo token es fondo del botón y color de los enlaces sobre el fondo de la
	 * página, y ningún guinda cumple las dos cosas a la vez. Se aclara hasta que
	 * el enlace llega a AA y el texto del botón pasa a ser oscuro.
	 */
	primary: "oklch(0.66 0.13 9.47)",
	"primary-foreground": "oklch(0.16 0.02 9.47)",
	secondary: "oklch(0.26 0 0)",
	"secondary-foreground": "oklch(0.92 0 0)",
	muted: "oklch(0.22 0 0)",
	"muted-foreground": "oklch(0.72 0 0)",
	accent: "oklch(0.72 0.087 76.2)",
	"accent-foreground": "oklch(0.16 0 0)",
	destructive: "oklch(0.64 0.16 12.76)",
	"destructive-foreground": "oklch(0.16 0 0)",
	success: "oklch(0.25 0.04 177)",
	"success-foreground": "oklch(0.8 0.08 177)",
	warning: "oklch(0.26 0.035 76.2)",
	"warning-foreground": "oklch(0.82 0.09 76.2)",
	border: "oklch(0.3 0 0)",
	input: "oklch(0.5 0 0)",
	ring: "oklch(0.66 0.13 9.47)",
	"chart-1": "oklch(0.66 0.13 9.47)",
	"chart-2": "oklch(0.72 0.087 76.2)",
	"chart-3": "oklch(0.55 0.14 12.76)",
	"chart-4": "oklch(0.6 0.07 177)",
	"chart-5": "oklch(0.45 0.05 177)",
	// La barra lateral se queda guinda en los dos modos: es la pieza de marca
	// que identifica la plataforma, no una superficie que deba apagarse.
	sidebar: "oklch(0.25 0.09 9.47)",
	"sidebar-foreground": "oklch(0.95 0 0)",
	"sidebar-primary": "oklch(0.689 0.087 76.2)",
	"sidebar-primary-foreground": "oklch(0.2 0.07 9.47)",
	"sidebar-accent": "oklch(0.33 0.12 9.47)",
	"sidebar-accent-foreground": "oklch(0.95 0 0)",
	"sidebar-border": "oklch(0.2 0.07 9.47)",
	"sidebar-ring": "oklch(0.689 0.087 76.2)",
};

/**
 * ÚNICA fuente de verdad de los valores del tema por defecto.
 *
 * Estos tokens vivían en los bloques `:root` y `.dark` de `app/app.css`. Se
 * movieron aquí en la fase A porque el CSS se genera en tiempo de petición:
 * dejarlos también en la hoja de estilos daría dos fuentes que se desincronizan
 * en silencio — y ahora que los tokens vienen de la base de datos, la copia de
 * app.css estaría muerta sin que nadie lo notara.
 *
 * Sigue siendo el respaldo real: es lo que se sirve cuando no hay tema activo, o
 * cuando la base no responde y la caché está fría.
 */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
	shared: BASE_SHARED,
	light: BASE_LIGHT,
	dark: BASE_DARK,
};

// ===============================================================
// Presets de fábrica
// ===============================================================

export interface ThemePresetDefinition {
	name: string;
	tokens: ThemeTokens;
}

/**
 * Los temas que se siembran con `isPreset: true` (prisma/seed.ts).
 *
 * No se editan ni se borran: se clonan. Son la red de seguridad de toda la
 * feature — lo que queda para volver cuando un tema publicado sale mal. La
 * plataforma tiene una sola identidad, así que hay un solo preset.
 */
export const THEME_PRESETS: readonly ThemePresetDefinition[] = [
	{ name: "Institucional", tokens: DEFAULT_THEME_TOKENS },
];
