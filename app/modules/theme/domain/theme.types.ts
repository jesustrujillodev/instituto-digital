import type * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	ColorTokenName,
	ContrastResult,
	cloneThemeRule,
	createThemeRule,
	FontFamilyKey,
	importThemeCssRule,
	renameThemeRule,
	saveDraftRule,
	setThemeModeRule,
	THEME_MODES,
	ThemeColorTokens,
	ThemeShadowTokens,
	ThemeSharedTokens,
	ThemeTokenSet,
	ThemeTokens,
	ThemeVariantName,
	themeTargetRule,
} from "./theme.rules";

/** `"light" | "dark" | "system"`. Derivado de la tupla, nunca escrito a mano. */
export type ThemeMode = (typeof THEME_MODES)[number];

// El modelo de tokens se define junto a la tupla que lo gobierna (theme.rules)
// y se reexporta aquí para que el resto del módulo tenga un solo sitio del que
// importar tipos.
export type {
	ColorTokenName,
	ContrastResult,
	FontFamilyKey,
	ThemeColorTokens,
	ThemeShadowTokens,
	ThemeSharedTokens,
	ThemeTokenSet,
	ThemeTokens,
	ThemeVariantName,
};

// ===============================================================
// DTOs de entrada
// ===============================================================

export type SetThemeModeDto = v.InferInput<typeof setThemeModeRule>;
export type CreateThemeDto = v.InferOutput<typeof createThemeRule>;
export type CloneThemeDto = v.InferOutput<typeof cloneThemeRule>;
export type RenameThemeDto = v.InferOutput<typeof renameThemeRule>;
export type SaveDraftDto = v.InferOutput<typeof saveDraftRule>;
export type ThemeTargetDto = v.InferOutput<typeof themeTargetRule>;
export type ImportThemeCssDto = v.InferOutput<typeof importThemeCssRule>;

// ===============================================================
// Modelo de la biblioteca
// ===============================================================

/** Un tema completo, con sus dos juegos de tokens. Lo consume el builder. */
export interface Theme {
	documentId: string;
	name: string;
	isPreset: boolean;
	/** Lo que el builder edita. SIEMPRE presente. */
	draftTokens: ThemeTokens;
	/** Lo que la app sirve. `null` = nunca se publicó. */
	publishedTokens: ThemeTokens | null;
	publishedAt: Date | null;
}

/**
 * Fila de la biblioteca. No lleva tokens: la lista se pinta muchas veces y
 * arrastrar dos juegos completos por tema para enseñar un nombre sería absurdo.
 */
export interface ThemeSummary {
	documentId: string;
	name: string;
	isPreset: boolean;
	isActive: boolean;
	isPublished: boolean;
	/** El borrador difiere de lo publicado: hay algo que publicar. */
	hasUnpublishedChanges: boolean;
}

/** Tema activo de la plataforma. `null` mientras no se haya activado ninguno. */
export interface ActiveTheme {
	documentId: string;
	name: string;
	tokens: ThemeTokens;
}

// ===============================================================
// Lo que sirve el loader raíz
// ===============================================================

/**
 * Preview de "probar en toda la app".
 *
 * Que esto llegue al cliente NO es lo que autoriza el preview: el loader raíz ya
 * comprobó el rol en servidor antes de mirar la cookie. Viaja para que la barra
 * flotante pueda decir qué tema se está probando y ofrecer salir.
 */
export interface ThemePreview {
	documentId: string;
	name: string;
}

/**
 * Lo que el loader raíz necesita para pintar: el modo efectivo y el CSS ya
 * serializado.
 *
 * El CSS viaja serializado y no como tokens sueltos a propósito — es la forma en
 * que se consume, y así el cliente no reimplementa `serializeThemeCss` ni puede
 * desviarse de lo que el servidor decidió.
 */
export interface ResolvedTheme {
	mode: ThemeMode;
	css: string;
	preview: ThemePreview | null;
	/**
	 * De dónde salió `css`:
	 * - `active`: el tema activo de la plataforma (de la base, de la caché o del
	 *   snapshot). Es lo único que el navegador guarda como "último conocido".
	 * - `preview`: el borrador que un admin está probando. Nunca se guarda.
	 * - `fallback`: el servidor NO sabe cuál es el tema activo y sirve el base. El
	 *   navegador pinta encima el último que conoció, si lo tiene.
	 */
	origin: ThemeOrigin;
	/** `themeFingerprint` de los tokens servidos. Ver last-known-theme.ts. */
	fingerprint: string;
}

export type ThemeOrigin = "active" | "preview" | "fallback";

/** Cambiar el modo no devuelve dato: el efecto es la cookie y la columna. */
export type ThemeModeResponse = AppResponse<null>;
