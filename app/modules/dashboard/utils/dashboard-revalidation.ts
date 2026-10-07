import { THEME_PREFERENCE_PATH } from "@/modules/theme/domain/theme.config";

/**
 * Cambiar el modo claro u oscuro se envía desde cualquier pantalla y no cambia
 * nada de lo que el panel pinta: recargarlo repetiría todas sus lecturas. Lo
 * demás sigue la regla por defecto.
 */
export const shouldRevalidateDashboard = ({
	formAction,
	defaultShouldRevalidate,
}: {
	formAction?: string;
	defaultShouldRevalidate: boolean;
}): boolean =>
	formAction === THEME_PREFERENCE_PATH ? false : defaultShouldRevalidate;
