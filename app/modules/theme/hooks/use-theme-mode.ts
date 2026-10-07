import { useFetcher, useRouteLoaderData } from "react-router";
import { THEME_PREFERENCE_PATH } from "../domain/theme.config";
import { isThemeMode } from "../domain/theme.rules";
import type { ThemeMode } from "../domain/theme.types";

/**
 * Modo actual y forma de cambiarlo, para cualquier pantalla de la aplicación.
 *
 * El modo sale del loader raíz —que es quien lo resolvió y quien puso la clase de
 * `<html>`— y no del DOM ni de la cookie leída en cliente: así el marcado que
 * renderiza el servidor y el que hidrata el cliente coinciden siempre.
 *
 * `mode` refleja de inmediato el envío en vuelo (`fetcher.formData`), así que el
 * check del menú se mueve al instante; la clase de `<html>` cambia con la
 * revalidación del loader raíz.
 */
export function useThemeMode(): {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
} {
	const data = useRouteLoaderData<typeof import("@/root").loader>("root");
	const fetcher = useFetcher();

	const pending = fetcher.formData?.get("mode");
	const mode = isThemeMode(pending) ? pending : (data?.themeMode ?? "system");

	return {
		mode,
		setMode: (next) =>
			fetcher.submit(
				{ mode: next },
				{ method: "post", action: THEME_PREFERENCE_PATH },
			),
	};
}
