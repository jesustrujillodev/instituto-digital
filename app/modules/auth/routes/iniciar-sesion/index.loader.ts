import { redirect } from "react-router";
import { safeReturnTo } from "@/shared/auth/return-to";
import { ok } from "@/shared/response/response.helpers";
import type { Route } from "./+types/index";

// Quien ya tiene sesión no ve el formulario: va al dashboard.
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { searchParams } = new URL(request.url);
	// Se sanea aquí Y en el action: el action lo recibe del cuerpo del
	// formulario, que un atacante controla al margen de esta URL.
	const redirectTo = safeReturnTo(searchParams.get("redirectTo"), "");

	// El MISMO criterio que requireAuth (payload ya verificado, epoch y refresco
	// silencioso incluidos). Verificar aquí solo la firma de la cookie
	// redirigiría con un token revocado que el dashboard devuelve a login: bucle.
	if (context.authPayload) {
		// Quien ya tiene sesión y viene de un QR va al escaneo, no al dashboard.
		throw redirect(redirectTo || "/dashboard");
	}

	return ok({ redirectTo });
};
