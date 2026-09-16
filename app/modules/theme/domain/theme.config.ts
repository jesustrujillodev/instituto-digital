import type {
	FontFamilyKey,
	ThemeColorTokens,
	ThemeSharedTokens,
	ThemeTokens,
} from "./theme.rules";
import { deriveDarkVariant } from "./theme.rules";

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
	/** Paquete que la auto-hospeda. `null` = no descarga nada. */
	packageName: string | null;
	category: "sans" | "serif" | "mono";
}

/**
 * Catálogo CURADO y auto-hospedado (decisión #5).
 *
 * Curado y no libre por dos razones: solo se puede ofrecer lo que el bundle
 * realmente sirve, y una caja de texto libre acabaría con `font-family` apuntando
 * a una fuente que existe en la máquina del admin y en ninguna otra.
 *
 * Auto-hospedado con `@fontsource`, importado en `app.css`: ninguna petición a
 * Google en runtime, y por tanto ninguna fuga de IPs de usuarios ni un tercero en
 * la ruta crítica del render. El coste del `@import` es solo el de las
 * declaraciones `@font-face` — el navegador descarga únicamente las familias que
 * el tema activo llega a usar.
 *
 * `packageName: null` marca las que no descargan NADA: las pilas genéricas del
 * sistema y las dos familias (Times New Roman, Courier New) que el sistema
 * operativo ya trae. Son las que permiten reproducir un tema de tweakcn que no
 * pedía una fuente web.
 *
 * Tipado como `Record<FontFamilyKey, …>`: añadir una clave a `FONT_FAMILY_KEYS`
 * sin darle entrada aquí no compila.
 */
export const FONT_CATALOG: Record<FontFamilyKey, FontFamilyDefinition> = {
	system: {
		label: "Del sistema",
		stack:
			'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
		packageName: null,
		category: "sans",
	},
	inter: {
		label: "Inter",
		stack: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
		packageName: "@fontsource-variable/inter",
		category: "sans",
	},
	geist: {
		label: "Geist",
		stack: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
		packageName: "@fontsource-variable/geist",
		category: "sans",
	},
	roboto: {
		label: "Roboto",
		stack: '"Roboto Variable", ui-sans-serif, system-ui, sans-serif',
		packageName: "@fontsource-variable/roboto",
		category: "sans",
	},
	"open-sans": {
		label: "Open Sans",
		stack: '"Open Sans Variable", ui-sans-serif, system-ui, sans-serif',
		packageName: "@fontsource-variable/open-sans",
		category: "sans",
	},
	montserrat: {
		label: "Montserrat",
		stack: '"Montserrat Variable", ui-sans-serif, system-ui, sans-serif',
		packageName: "@fontsource-variable/montserrat",
		category: "sans",
	},
	// Sin versión variable: el paquete trae un fichero por peso y app.css pide
	// 400/500/600/700 uno a uno. El nombre de familia NO lleva "Variable".
	poppins: {
		label: "Poppins",
		stack: "Poppins, ui-sans-serif, system-ui, sans-serif",
		packageName: "@fontsource/poppins",
		category: "sans",
	},
	// Manuscrita, de un solo peso (400). Se cataloga como `sans` porque es donde
	// la usan los temas que la traen —titulares y texto—, no porque lo sea.
	"architects-daughter": {
		label: "Architects Daughter",
		stack: '"Architects Daughter", ui-sans-serif, system-ui, sans-serif',
		packageName: "@fontsource/architects-daughter",
		category: "sans",
	},
	"playfair-display": {
		label: "Playfair Display",
		stack: '"Playfair Display Variable", ui-serif, Georgia, serif',
		packageName: "@fontsource-variable/playfair-display",
		category: "serif",
	},
	merriweather: {
		label: "Merriweather",
		stack: '"Merriweather Variable", ui-serif, Georgia, serif',
		packageName: "@fontsource-variable/merriweather",
		category: "serif",
	},
	"libre-baskerville": {
		label: "Libre Baskerville",
		stack: '"Libre Baskerville Variable", ui-serif, Georgia, serif',
		packageName: "@fontsource-variable/libre-baskerville",
		category: "serif",
	},
	"jetbrains-mono": {
		label: "JetBrains Mono",
		stack: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, monospace',
		packageName: "@fontsource-variable/jetbrains-mono",
		category: "mono",
	},
	"fira-code": {
		label: "Fira Code",
		stack: '"Fira Code Variable", ui-monospace, SFMono-Regular, monospace',
		packageName: "@fontsource-variable/fira-code",
		category: "mono",
	},
	// Sin versión variable: app.css pide 400 y 700, los dos únicos que existen.
	"space-mono": {
		label: "Space Mono",
		stack: '"Space Mono", ui-monospace, SFMono-Regular, monospace',
		packageName: "@fontsource/space-mono",
		category: "mono",
	},
	"system-serif": {
		label: "Del sistema (serif)",
		stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
		packageName: null,
		category: "serif",
	},
	"system-mono": {
		label: "Del sistema (mono)",
		stack:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		packageName: null,
		category: "mono",
	},
	/*
	 * Las dos de abajo NO son pilas genéricas: nombran una familia concreta que
	 * Windows y macOS traen instalada. Se catalogan igual que las auto-hospedadas
	 * porque para el admin son lo mismo —una fuente con nombre que se elige del
	 * desplegable—, y no descargan nada porque ya están en la máquina.
	 *
	 * La reserva detrás del nombre es la que importa: en un Linux sin las fuentes
	 * de Microsoft, la familia no existe y se cae a `serif` / `monospace`.
	 */
	"times-new-roman": {
		label: "Times New Roman",
		stack: '"Times New Roman", Times, serif',
		packageName: null,
		category: "serif",
	},
	"courier-new": {
		label: "Courier New",
		stack: '"Courier New", Courier, monospace',
		packageName: null,
		category: "mono",
	},
};

// ===============================================================
// Tema base
// ===============================================================

const BASE_SHARED: ThemeSharedTokens = {
	// `--radius-sm … --radius-4xl` se derivan de `--radius` en app.css.
	radius: "0.625rem",
	borderWidth: "1px",
	spacing: "0.25rem",
	fontSans: "inter",
	fontSerif: "merriweather",
	fontMono: "jetbrains-mono",
	fontHeading: "inter",
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
	background: "oklch(1 0 0)",
	foreground: "oklch(0.145 0 0)",
	card: "oklch(1 0 0)",
	"card-foreground": "oklch(0.145 0 0)",
	popover: "oklch(1 0 0)",
	"popover-foreground": "oklch(0.145 0 0)",
	primary: "oklch(0.205 0 0)",
	"primary-foreground": "oklch(0.985 0 0)",
	secondary: "oklch(0.97 0 0)",
	"secondary-foreground": "oklch(0.205 0 0)",
	muted: "oklch(0.97 0 0)",
	// 0.556 dejaba `muted / muted-foreground` en 4,34: el grado decía "solo texto
	// grande" y el panel lo contaba como AA. El texto secundario de la aplicación
	// es de 14 px, así que el mínimo que le toca es 4,5.
	"muted-foreground": "oklch(0.54 0 0)",
	accent: "oklch(0.97 0 0)",
	"accent-foreground": "oklch(0.205 0 0)",
	// El botón destructivo real es `bg-destructive/10 text-destructive`. Con 0.577
	// ese par daba 4,05 en claro (3,91 sobre el fondo crema de Editorial).
	destructive: "oklch(0.533 0.245 27.325)",
	// Añadido en la fase A: no existía en ninguna variante. tweakcn y el generador
	// de shadcn lo dan por hecho, así que sin él un tema pegado desde fuera llega
	// incompleto.
	"destructive-foreground": "oklch(0.985 0 0)",
	// Añadidos en la fase A: destino de los `bg-green-*` / `bg-yellow-*` que
	// estaban hardcodeados en data-table-columns.tsx.
	success: "oklch(0.962 0.044 156.743)",
	"success-foreground": "oklch(0.448 0.119 151.328)",
	warning: "oklch(0.973 0.071 103.193)",
	"warning-foreground": "oklch(0.476 0.114 61.907)",
	border: "oklch(0.922 0 0)",
	// `input` es el BORDE de campos, selects y checkboxes: lo que identifica al
	// control, y WCAG 1.4.11 le pide 3:1. Con 0.922 daba 1,26 — un campo sin
	// contorno visible. `border` se queda claro: separa, no identifica.
	input: "oklch(0.645 0 0)",
	// Indicador de foco: mismo mínimo de 3:1. Daba 2,59.
	ring: "oklch(0.6 0 0)",
	"chart-1": "oklch(0.87 0 0)",
	"chart-2": "oklch(0.556 0 0)",
	"chart-3": "oklch(0.439 0 0)",
	"chart-4": "oklch(0.371 0 0)",
	"chart-5": "oklch(0.269 0 0)",
	sidebar: "oklch(0.985 0 0)",
	"sidebar-foreground": "oklch(0.145 0 0)",
	"sidebar-primary": "oklch(0.205 0 0)",
	"sidebar-primary-foreground": "oklch(0.985 0 0)",
	"sidebar-accent": "oklch(0.97 0 0)",
	"sidebar-accent-foreground": "oklch(0.205 0 0)",
	"sidebar-border": "oklch(0.922 0 0)",
	"sidebar-ring": "oklch(0.6 0 0)",
};

const BASE_DARK: ThemeColorTokens = {
	background: "oklch(0.145 0 0)",
	foreground: "oklch(0.985 0 0)",
	card: "oklch(0.205 0 0)",
	"card-foreground": "oklch(0.985 0 0)",
	popover: "oklch(0.205 0 0)",
	"popover-foreground": "oklch(0.985 0 0)",
	primary: "oklch(0.922 0 0)",
	"primary-foreground": "oklch(0.205 0 0)",
	secondary: "oklch(0.269 0 0)",
	"secondary-foreground": "oklch(0.985 0 0)",
	muted: "oklch(0.269 0 0)",
	"muted-foreground": "oklch(0.708 0 0)",
	accent: "oklch(0.269 0 0)",
	"accent-foreground": "oklch(0.985 0 0)",
	destructive: "oklch(0.704 0.191 22.216)",
	"destructive-foreground": "oklch(0.985 0 0)",
	// El alfa va DENTRO del token: reproduce el `bg-green-900/20` original y deja
	// que el builder redefina estos colores igual que redefine `primary`.
	success: "oklch(0.393 0.095 152.535 / 20%)",
	"success-foreground": "oklch(0.792 0.209 151.711)",
	warning: "oklch(0.421 0.095 57.708 / 20%)",
	"warning-foreground": "oklch(0.852 0.199 91.936)",
	border: "oklch(1 0 0 / 10%)",
	// Mismo motivo que en claro: al 15% el borde de los campos se componía sobre
	// el fondo en 1,47:1, por debajo del 3:1 de WCAG 1.4.11. El `dark:bg-input/30`
	// que llevan los campos sube con él, y eso es lo que les da cuerpo en oscuro.
	input: "oklch(1 0 0 / 35%)",
	ring: "oklch(0.556 0 0)",
	"chart-1": "oklch(0.87 0 0)",
	"chart-2": "oklch(0.556 0 0)",
	"chart-3": "oklch(0.439 0 0)",
	"chart-4": "oklch(0.371 0 0)",
	"chart-5": "oklch(0.269 0 0)",
	sidebar: "oklch(0.205 0 0)",
	"sidebar-foreground": "oklch(0.985 0 0)",
	"sidebar-primary": "oklch(0.488 0.243 264.376)",
	"sidebar-primary-foreground": "oklch(0.985 0 0)",
	"sidebar-accent": "oklch(0.269 0 0)",
	"sidebar-accent-foreground": "oklch(0.985 0 0)",
	"sidebar-border": "oklch(1 0 0 / 10%)",
	"sidebar-ring": "oklch(0.556 0 0)",
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
 * Construye un preset sobre el tema base.
 *
 * La variante oscura parte de la del tema base —que ya está afinada— y solo
 * cambia los tokens que el preset toca en claro, con su valor DERIVADO. Se usa
 * la misma función que ofrece el botón "derivar oscuro" del builder: lo que el
 * admin ve al pulsarlo es exactamente lo que produjo estos presets, y no una
 * segunda implementación que se le parece.
 *
 * Derivar la variante oscura ENTERA sería peor: los tokens con alfa dentro del
 * valor (`success`, `border`) están calibrados a mano y una inversión de
 * luminancia los estropea sin ganar nada.
 *
 * `dark` es el retoque a mano de esa derivación, y existe por la misma razón que
 * la UI llama a "derivar oscuro" un punto de partida: invertir la luminancia
 * acierta con los neutros, pero un acento saturado acaba con un contraste que no
 * llega a AA. Lo que se corrige aquí son exactamente esos pares, y el comentario
 * de cada preset dice cuál y con qué ratio salía.
 */
const preset = (
	name: string,
	light: Partial<ThemeColorTokens>,
	shared: Partial<ThemeSharedTokens> = {},
	dark: Partial<ThemeColorTokens> = {},
): ThemePresetDefinition => {
	const lightTokens: ThemeColorTokens = { ...BASE_LIGHT, ...light };
	const derived = deriveDarkVariant(lightTokens);
	const darkTokens: ThemeColorTokens = { ...BASE_DARK };

	for (const token of Object.keys(light) as (keyof ThemeColorTokens)[]) {
		darkTokens[token] = derived[token];
	}

	return {
		name,
		tokens: {
			shared: { ...BASE_SHARED, ...shared },
			light: lightTokens,
			dark: { ...darkTokens, ...dark },
		},
	};
};

/**
 * Los temas que se siembran con `isPreset: true` (prisma/seed.ts).
 *
 * No se editan ni se borran: se clonan. Son la red de seguridad de toda la
 * feature — lo que queda para volver cuando un tema publicado sale mal.
 */
export const THEME_PRESETS: readonly ThemePresetDefinition[] = [
	{ name: "Neutro", tokens: DEFAULT_THEME_TOKENS },

	preset(
		"Índigo",
		{
			primary: "oklch(0.511 0.262 276.966)",
			"primary-foreground": "oklch(0.985 0 0)",
			accent: "oklch(0.962 0.018 272.314)",
			"accent-foreground": "oklch(0.457 0.24 277.023)",
			ring: "oklch(0.511 0.262 276.966)",
			"chart-1": "oklch(0.511 0.262 276.966)",
			"chart-2": "oklch(0.585 0.233 277.117)",
			"chart-3": "oklch(0.673 0.182 276.935)",
			"chart-4": "oklch(0.785 0.115 274.713)",
			"chart-5": "oklch(0.87 0.065 274.039)",
			"sidebar-primary": "oklch(0.511 0.262 276.966)",
			"sidebar-ring": "oklch(0.511 0.262 276.966)",
		},
		{},
		{
			// El índigo invertido salía en 0.5405: botón primario en 3,56 y el mismo
			// índigo como texto de enlace en 3,51. Aclararlo arregla los dos.
			primary: "oklch(0.605 0.262 276.966)",
			// Texto sobre la fila resaltada: 4,33 al derivar.
			"accent-foreground": "oklch(0.603 0.24 277.023)",
		},
	),

	preset(
		"Esmeralda",
		{
			primary: "oklch(0.508 0.118 165.612)",
			"primary-foreground": "oklch(0.985 0 0)",
			accent: "oklch(0.95 0.052 163.051)",
			"accent-foreground": "oklch(0.428 0.095 166.913)",
			ring: "oklch(0.508 0.118 165.612)",
			"chart-1": "oklch(0.508 0.118 165.612)",
			"chart-2": "oklch(0.596 0.145 163.225)",
			"chart-3": "oklch(0.696 0.17 162.48)",
			"chart-4": "oklch(0.797 0.174 160.65)",
			"chart-5": "oklch(0.871 0.15 154.449)",
			"sidebar-primary": "oklch(0.508 0.118 165.612)",
			"sidebar-ring": "oklch(0.508 0.118 165.612)",
		},
		{ radius: "0.5rem" },
		{
			// El verde invertido salía en 0.5431: botón primario en 4,27 y el verde
			// como texto de enlace en 4,21.
			primary: "oklch(0.567 0.118 165.612)",
		},
	),

	preset(
		"Editorial",
		{
			primary: "oklch(0.396 0.141 25.723)",
			"primary-foreground": "oklch(0.985 0 0)",
			background: "oklch(0.987 0.007 84.573)",
			card: "oklch(0.995 0.004 84.573)",
			accent: "oklch(0.954 0.038 75.164)",
			"accent-foreground": "oklch(0.396 0.141 25.723)",
			ring: "oklch(0.396 0.141 25.723)",
			"sidebar-primary": "oklch(0.396 0.141 25.723)",
			"sidebar-ring": "oklch(0.396 0.141 25.723)",
		},
		{
			fontSans: "merriweather",
			fontHeading: "playfair-display",
			fontSerif: "playfair-display",
			radius: "0.25rem",
			letterSpacing: "0.01em",
		},
		{
			// El rojo invertido queda claro (0.639) y el blanco heredado de la base
			// se quedaba en 3,45 encima. El elemento activo de la barra lateral pide
			// texto oscuro, igual que el botón primario de los otros dos presets.
			"sidebar-primary-foreground": "oklch(0.205 0 0)",
		},
	),
];
