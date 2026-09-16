import * as v from "valibot";
import { themeRules } from "./theme.rules";

// Cada función valida y lanza ValiError si falla.
// El action decide cómo manejar el error (parseInput → envelope).

export const validateSetThemeMode = (data: unknown) =>
	v.parse(themeRules.setMode, data);

export const validateCreateTheme = (data: unknown) =>
	v.parse(themeRules.create, data);

export const validateCloneTheme = (data: unknown) =>
	v.parse(themeRules.clone, data);

export const validateRenameTheme = (data: unknown) =>
	v.parse(themeRules.rename, data);

export const validateSaveDraft = (data: unknown) =>
	v.parse(themeRules.saveDraft, data);

export const validateThemeTarget = (data: unknown) =>
	v.parse(themeRules.target, data);

export const validateImportThemeCss = (data: unknown) =>
	v.parse(themeRules.importCss, data);

/**
 * Tokens completos. Se usa en la FRONTERA (lo que llega del builder) y también
 * al LEER de la base, que es el otro sitio donde el contenido no se controla:
 * una fila puede estar corrupta o venir de un esquema anterior.
 */
export const validateThemeTokens = (data: unknown) =>
	v.parse(themeRules.tokens, data);

/**
 * Variante silenciosa de la anterior, para el camino de lectura.
 *
 * `null` en vez de lanzar: quien lee una fila corrupta no quiere una excepción
 * —dejaría la plataforma entera sin pintar— sino caer al tema base y registrarlo.
 */
export const safeParseThemeTokens = (data: unknown) => {
	const result = v.safeParse(themeRules.tokens, data);
	return result.success ? result.output : null;
};
