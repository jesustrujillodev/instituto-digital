import { requireAuth } from "@/shared/auth/require-auth.server";
import { ok } from "@/shared/response/response.helpers";
import type { DashboardLayoutData } from "../layout.types";
import type { Route } from "./+types/dashboard.layout";

/**
 * Gate de autenticación y única lectura de identidad para todo /dashboard/*.
 *
 * Al colgar del `layout()` que envuelve la zona protegida, el gate es
 * ESTRUCTURAL: una ruta nueva dentro del layout queda protegida por
 * construcción, sin depender de que su loader se acuerde de llamar requireAuth.
 *
 * OJO: esto NO es una re-verificación de sesión. El middleware de root.tsx ya
 * validó (y si hizo falta, refrescó) el token; `requireAuth` solo lee
 * `context.authPayload` en memoria — es O(1) y no toca la base de datos. No lo
 * conviertas en una verificación "de verdad" ni lo elimines por parecer
 * redundante.
 *
 * El tipo de retorno explícito es load-bearing: es lo que permite a `useAuth()`
 * tiparse contra DashboardLayoutData sin importar nunca este módulo de servidor.
 */
export const loader = async ({
	request,
	context,
}: Route.LoaderArgs): Promise<DashboardLayoutData> => {
	const auth = await requireAuth(request, context);

	// Lectura cacheada (coste ~0): la misma que ya paga cada petición
	// autenticada para el epoch. Solo la ven los roles exentos — los demás ni
	// siquiera llegan aquí (docs/auth/02 §B.6).
	const securityStateResult = await context.securityStateService.getState();
	const securityState = securityStateResult.success
		? securityStateResult.data
		: null;

	return ok({
		user: {
			documentId: auth.documentId,
			email: auth.email,
			role: auth.role,
		},
		securityState,
	});
};
