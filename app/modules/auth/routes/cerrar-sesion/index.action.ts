import { clearAuthCookies, parseTokenCookies } from "@/core/cookies.server";
import type { Route } from "./+types/index.action";

export const action = async ({ request, context }: Route.ActionArgs) => {
	const { refreshToken } = await parseTokenCookies(
		request.headers.get("Cookie"),
	);

	if (refreshToken) {
		// El resultado no cambia el desenlace: cerrar sesión SIEMPRE limpia las
		// cookies y redirige. Si el borrado en servidor falló, el servicio ya lo
		// registró — dejar al usuario en una pantalla de error tras pedir salir
		// sería peor que quedarse con una sesión huérfana que caducará sola.
		await context.authService.logout(refreshToken);
	}

	const clearedCookies = await clearAuthCookies();

	const headers = new Headers({ Location: "/iniciar-sesion" });
	for (const cookie of clearedCookies) {
		headers.append("Set-Cookie", cookie);
	}

	// Return (not throw) a full Response so the browser applies
	// the Set-Cookie headers before following the redirect.
	return new Response(null, { status: 303, headers });
};
