import type { ResolvedTheme, ThemeMode } from "../domain/theme.types";

/**
 * Último tema activo conocido, guardado en el NAVEGADOR.
 *
 * Es la segunda red del tema activo (la primera es el snapshot en disco del
 * servidor, theme.snapshot.server.ts). Cubre lo que el servidor no puede: un
 * nodo recién creado que arranca con la base caída y nunca llegó a leer el tema.
 * Quien ya visitó la plataforma sigue viendo la marca.
 *
 * Se guarda CSS ya serializado por el servidor —no tokens— porque lo tiene que
 * pintar un script inline ANTES de hidratar, sin acceso al bundle: no puede
 * llamar a `serializeThemeCss`. Así tampoco hay una segunda implementación.
 */

export const LAST_KNOWN_THEME_STORAGE_KEY = "theme:last-active";

/** `<style>` que emite el servidor con los tokens. */
export const THEME_STYLE_ID = "theme-tokens";

/** `<style>` que se pinta encima cuando el servidor sirvió `fallback`. */
export const LAST_KNOWN_THEME_STYLE_ID = "theme-last-known";

const STORAGE_VERSION = 1;

/**
 * Tope de lo que se acepta de `localStorage`. Un tema real ronda los 5 KB; esto
 * solo impide que un valor absurdo acabe inyectado en el `<head>`.
 */
const MAX_CSS_LENGTH = 100_000;

interface StoredTheme {
	v: typeof STORAGE_VERSION;
	/** `themeFingerprint` del tema al que pertenecen TODAS las entradas de `css`. */
	fingerprint: string;
	/** Un CSS por modo: el servidor solo manda el del modo de cada petición. */
	css: Partial<Record<ThemeMode, string>>;
}

const readStored = (storage: Storage): StoredTheme | null => {
	try {
		const data: unknown = JSON.parse(
			storage.getItem(LAST_KNOWN_THEME_STORAGE_KEY) ?? "null",
		);
		if (
			typeof data === "object" &&
			data !== null &&
			"v" in data &&
			data.v === STORAGE_VERSION &&
			"fingerprint" in data &&
			typeof data.fingerprint === "string" &&
			"css" in data &&
			typeof data.css === "object" &&
			data.css !== null
		) {
			return data as StoredTheme;
		}
	} catch {
		// JSON corrupto: se trata como "sin copia" y se reescribe.
	}
	return null;
};

/**
 * Guarda el CSS del tema activo para el modo de esta respuesta.
 *
 * Si la huella cambió, el tema es otro y se descartan los CSS de los demás
 * modos: mezclarlos pintaría el tema viejo al cambiar de modo sin conexión.
 *
 * Solo acepta `origin: "active"`: un borrador en preview o el tema base servido
 * por no saber cuál es el activo NO son "el último tema activo".
 */
export const rememberActiveTheme = (
	storage: Storage,
	theme: Pick<ResolvedTheme, "origin" | "fingerprint" | "mode" | "css">,
): void => {
	if (theme.origin !== "active") return;

	const stored = readStored(storage);
	const css =
		stored?.fingerprint === theme.fingerprint ? { ...stored.css } : {};

	// Lo normal: cada navegación trae el mismo tema. No se reescribe.
	if (css[theme.mode] === theme.css) return;
	css[theme.mode] = theme.css;

	const next: StoredTheme = {
		v: STORAGE_VERSION,
		fingerprint: theme.fingerprint,
		css,
	};

	try {
		storage.setItem(LAST_KNOWN_THEME_STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Cuota llena o almacenamiento bloqueado (modo privado): se pierde la red,
		// no la página.
	}
};

/**
 * Pinta encima el último tema activo guardado. Devuelve si pintó algo.
 *
 * ⚠ AUTOCONTENIDA a propósito: `lastKnownThemeScript` la serializa con
 * `toString()` en un `<script>` inline que corre antes de hidratar. No puede
 * referirse a NADA de fuera de su cuerpo —ni constantes del módulo, ni
 * helpers—, por eso todo llega por parámetro.
 *
 * El CSS se asigna con `textContent`: el navegador nunca lo interpreta como HTML.
 */
export function applyLastKnownTheme(
	storageKey: string,
	styleId: string,
	baseStyleId: string,
	mode: string,
	maxLength: number,
): boolean {
	try {
		const data = JSON.parse(window.localStorage.getItem(storageKey) || "null");
		if (data?.v !== 1 || !data.css || typeof data.css !== "object") {
			return false;
		}

		// El del modo pedido; si no está, cualquiera del mismo tema es mejor que
		// perder la marca.
		const css = [mode, "system", "light", "dark"]
			.map((key) => data.css[key])
			.find((value) => typeof value === "string" && value.length > 0);
		if (typeof css !== "string" || css.length > maxLength) return false;

		let style = document.getElementById(styleId);
		if (!style) {
			style = document.createElement("style");
			style.id = styleId;
			// Justo detrás del `<style>` del servidor: misma posición en la
			// cascada que tendría el tema si el servidor lo hubiera conocido.
			const base = document.getElementById(baseStyleId);
			if (base) base.after(style);
			else document.head.appendChild(style);
		}
		style.textContent = css;
		return true;
	} catch {
		return false;
	}
}

/** Quita lo pintado por `applyLastKnownTheme` cuando el servidor ya sabe el tema. */
export const clearLastKnownTheme = (): void => {
	document.getElementById(LAST_KNOWN_THEME_STYLE_ID)?.remove();
};

/**
 * Script inline para el `<head>`. Solo se emite con `origin: "fallback"`, así que
 * en operación normal la página no lleva ningún script bloqueante.
 *
 * Todo lo que se interpola pasa por `JSON.stringify`, y `mode` además es un
 * valor de la allowlist de modos.
 */
export const lastKnownThemeScript = (mode: ThemeMode): string => {
	const args = [
		LAST_KNOWN_THEME_STORAGE_KEY,
		LAST_KNOWN_THEME_STYLE_ID,
		THEME_STYLE_ID,
		mode,
		MAX_CSS_LENGTH,
	]
		.map((value) => JSON.stringify(value))
		.join(",");

	return `(${applyLastKnownTheme.toString()})(${args})`;
};

/**
 * `applyLastKnownTheme` con los mismos argumentos que el script inline, para el
 * cliente ya hidratado: un `<script>` que React inserta al navegar no se ejecuta.
 */
export const applyLastKnownThemeFor = (mode: ThemeMode): boolean =>
	applyLastKnownTheme(
		LAST_KNOWN_THEME_STORAGE_KEY,
		LAST_KNOWN_THEME_STYLE_ID,
		THEME_STYLE_ID,
		mode,
		MAX_CSS_LENGTH,
	);
