import { clearAuthCookies } from "@/core/cookies.server";
import { requireAuth } from "@/shared/auth/require-auth.server";
import type { Route } from "./+types/index.action";

// "Cerrar sesión en todos los dispositivos" — revoca la familia completa de
// sesiones del usuario autenticado (logoutAll) y limpia las cookies locales.
export const action = async ({ request, context }: Route.ActionArgs) => {
	const auth = await requireAuth(request, context);

	// Mismo criterio que en cerrar-sesion: el desenlace es siempre limpiar las
	// cookies y redirigir. Un fallo aquí ya quedó registrado por el servicio.
	await context.authService.logoutAll(auth.userId);

	const clearedCookies = await clearAuthCookies();

	const headers = new Headers({ Location: "/iniciar-sesion" });
	for (const cookie of clearedCookies) {
		headers.append("Set-Cookie", cookie);
	}

	// Return (not throw) a full Response so the browser applies
	// the Set-Cookie headers before following the redirect.
	return new Response(null, { status: 303, headers });
};
