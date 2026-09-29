import type { AppResponse } from "@/shared/response/response.types";
import type { ThemeMode, ThemeModeResponse } from "./theme.types";

export interface IThemeService {
	/**
	 * Modo efectivo para pintar `<html>`.
	 *
	 * Lo consume el loader raíz, así que corre en TODA petición: la columna del
	 * usuario solo se consulta cuando hay sesión y la cookie no trae preferencia
	 * — el caso de un dispositivo nuevo, no el habitual.
	 */
	resolveMode(input: {
		cookieMode: unknown;
		userId: number | null;
	}): Promise<AppResponse<ThemeMode>>;

	/**
	 * Persiste la preferencia en la cuenta.
	 *
	 * `userId: null` (visitante anónimo) es un caso legítimo, no un error: la
	 * cookie que emite el adaptador ya guarda la preferencia, y no hay cuenta
	 * donde replicarla.
	 */
	setMode(input: {
		userId: number | null;
		mode: ThemeMode;
	}): Promise<ThemeModeResponse>;
}
