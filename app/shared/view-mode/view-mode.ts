export const VIEW_MODES = ["grid", "list"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const DEFAULT_VIEW_MODE: ViewMode = "grid";

/** Pantallas que recuerdan su disposición; cada una guarda la suya. */
export const VIEW_MODE_SCREENS = {
	courses: "cursos",
	teaching: "imparticion",
	available: "cursos-disponibles",
	mine: "mis-cursos",
} as const;
export type ViewModeScreen =
	(typeof VIEW_MODE_SCREENS)[keyof typeof VIEW_MODE_SCREENS];

const COOKIE_PREFIX = "vista_";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

const cookieNameOf = (screen: ViewModeScreen) =>
	`${COOKIE_PREFIX}${screen.replaceAll("-", "_")}`;

const isViewMode = (value: string): value is ViewMode =>
	(VIEW_MODES as readonly string[]).includes(value);

/**
 * Disposición guardada para una pantalla, leída del encabezado `Cookie`.
 *
 * La lee el loader para que el servidor pinte ya la disposición elegida: leída
 * en el cliente, la cuadrícula parpadearía antes de volverse lista.
 */
export const readViewMode = (
	cookieHeader: string | null,
	screen: ViewModeScreen,
): ViewMode => {
	const name = cookieNameOf(screen);

	for (const pair of cookieHeader?.split(";") ?? []) {
		const [key, value] = pair.trim().split("=");
		if (key === name && value && isViewMode(value)) return value;
	}

	return DEFAULT_VIEW_MODE;
};

/** Valor para `document.cookie`. No es un secreto: la escribe el navegador. */
export const serializeViewMode = (screen: ViewModeScreen, mode: ViewMode) =>
	`${cookieNameOf(screen)}=${mode}; path=/; max-age=${COOKIE_MAX_AGE_S}; samesite=lax`;
