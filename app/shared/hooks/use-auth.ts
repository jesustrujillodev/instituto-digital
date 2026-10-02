import { useRouteLoaderData } from "react-router";
import type { SessionUser } from "@/shared/auth/session-user";
import {
	DASHBOARD_LAYOUT_ID,
	FULLSCREEN_LAYOUT_ID,
} from "@/shared/layout/layout.constants";
import type {
	DashboardLayoutData,
	FullscreenLayoutData,
} from "@/shared/layout/layout.types";

/**
 * Identidad de la sesión leída del loader del layout del dashboard —o del de
 * pantalla completa—, o null si el componente vive fuera de esas zonas.
 *
 * Se usa useRouteLoaderData —y no Outlet context— porque `<Outlet context>` solo
 * provee al subárbol del outlet: la barra lateral es HERMANA del <Outlet/> y
 * quedaría fuera del provider.
 */
export function useOptionalAuth(): SessionUser | null {
	// useRouteLoaderData recibe un `string` sin validar y devuelve `| undefined`
	// si esa ruta no está montada: de ahí el id constante y este null explícito.
	const dashboard =
		useRouteLoaderData<DashboardLayoutData>(DASHBOARD_LAYOUT_ID);
	const fullscreen =
		useRouteLoaderData<FullscreenLayoutData>(FULLSCREEN_LAYOUT_ID);

	return dashboard?.data.user ?? fullscreen?.data.user ?? null;
}

/**
 * Igual que useOptionalAuth pero garantiza la sesión.
 *
 * Falla rápido si se usa fuera de /dashboard/*: ahí la ausencia de sesión sería
 * un bug de routing, no un caso a tolerar con un `?.` silencioso.
 */
export function useAuth(): SessionUser {
	const user = useOptionalAuth();

	if (!user) {
		throw new Error(
			"useAuth() requiere estar dentro del layout del dashboard o del de pantalla completa. Usa useOptionalAuth() en rutas públicas.",
		);
	}

	return user;
}
