import { useLocation, useNavigation } from "react-router";
import { useDelayedFlag } from "./use-delayed-flag";

/**
 * ¿Se está recargando ESTA pantalla con otros filtros, otra búsqueda u otra
 * página? Una navegación a otra ruta no cuenta: hacer clic en una fila no debe
 * disolver la lista en siluetas mientras se va a otra pantalla.
 */
export function useRouteReloading(): boolean {
	const navigation = useNavigation();
	const { pathname } = useLocation();

	return useDelayedFlag(
		navigation.state === "loading" && navigation.location.pathname === pathname,
	);
}
