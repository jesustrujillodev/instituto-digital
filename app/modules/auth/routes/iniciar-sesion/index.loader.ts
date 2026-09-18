import { redirect } from "react-router";
import { parseTokenCookies } from "@/core/cookies.server";
import { safeReturnTo } from "@/shared/auth/return-to";
import { ok } from "@/shared/response/response.helpers";
import type { Route } from "./+types/index";

// If the user already has a valid access token, skip the login page
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { searchParams } = new URL(request.url);
	// Se sanea aquí Y en el action: el action lo recibe del cuerpo del
	// formulario, que un atacante controla al margen de esta URL.
	const redirectTo = safeReturnTo(searchParams.get("redirectTo"), "");

	const cookieHeader = request.headers.get("Cookie");
	const { accessToken } = await parseTokenCookies(cookieHeader);

	if (accessToken) {
		const payload = await context.authService.verifyAccessToken(accessToken);
		// Quien ya tiene sesión y viene de un QR va al escaneo, no a la landing.
		if (payload) throw redirect(redirectTo || "/");
	}

	return ok({ redirectTo });
};
