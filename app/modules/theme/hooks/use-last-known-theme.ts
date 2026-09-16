import { useEffect } from "react";
import type { ResolvedTheme } from "../domain/theme.types";
import {
	applyLastKnownThemeFor,
	clearLastKnownTheme,
	rememberActiveTheme,
} from "../utils/last-known-theme";

/**
 * Mantiene el último tema activo del navegador en sincronía con lo que resuelve
 * el loader raíz (utils/last-known-theme.ts):
 *
 * - `active`  → lo guarda y quita cualquier tema pintado encima.
 * - `preview` → no guarda nada (es un borrador) y quita lo pintado encima.
 * - `fallback`→ pinta el último guardado. En la carga inicial ya lo hizo el
 *   script inline; esto cubre llegar a `fallback` navegando, donde el `<script>`
 *   que inserta React no se ejecuta.
 */
export function useLastKnownTheme(theme: ResolvedTheme) {
	const { origin, mode, css, fingerprint } = theme;

	useEffect(() => {
		if (origin === "fallback") {
			applyLastKnownThemeFor(mode);
			return;
		}

		clearLastKnownTheme();

		try {
			rememberActiveTheme(window.localStorage, {
				origin,
				mode,
				css,
				fingerprint,
			});
		} catch {
			// `localStorage` puede lanzar solo con tocarlo (cookies bloqueadas).
		}
	}, [origin, mode, css, fingerprint]);
}
