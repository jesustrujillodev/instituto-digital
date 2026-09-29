import * as v from "valibot";

/**
 * Modos de esquema de color. ÚNICO punto de variación: el schema de valibot, el
 * tipo `ThemeMode` y la resolución de abajo derivan todos de esta tupla.
 *
 * `system` no es un tercer tema — es la ausencia de elección explícita, que se
 * delega al sistema operativo vía `prefers-color-scheme`.
 */
export const THEME_MODES = ["light", "dark", "system"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

/** `true` si el valor es uno de los modos conocidos. */
export const isThemeMode = (value: unknown): value is ThemeMode =>
	typeof value === "string" && THEME_MODES.includes(value as ThemeMode);

/**
 * Modo efectivo a partir de las dos fuentes persistidas.
 *
 * La COOKIE gana sobre la columna del usuario, y el orden importa: la cookie es
 * lo único disponible para peticiones anónimas, así que si la columna tuviera
 * precedencia la misma persona vería un modo en la landing y otro tras entrar.
 * La columna existe para sembrar la cookie en un dispositivo nuevo, no para
 * discutirle la preferencia local.
 *
 * Valores basura (cookie manipulada, columna de una versión anterior) se ignoran
 * en vez de fallar: el peor desenlace posible aquí es pintar el modo por defecto.
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
 * Clase que va en `<html>`, y lo único que elige la variante de los tokens de
 * app.css.
 *
 * Con `system` NO se emite `dark`: el esquema lo decide el `@media` de app.css.
 * La clase `theme-system` existe para que ese `@media` y el custom variant
 * `dark:` de Tailwind puedan engancharse a ese caso.
 */
export const themeHtmlClass = (mode: ThemeMode): string => {
	if (mode === "dark") return "dark";
	if (mode === "system") return "theme-system";
	return "";
};

export const themeModeRule = v.picklist(
	THEME_MODES,
	"El modo de apariencia no es válido.",
);

/** Entrada del action del toggle. Un solo campo, pero se valida igual. */
export const setThemeModeRule = v.object({
	mode: themeModeRule,
});

export const themeRules = {
	setMode: setThemeModeRule,
} as const;
