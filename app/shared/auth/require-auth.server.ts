import { redirect } from "react-router";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import {
	allowsPendingPasswordChange,
	PASSWORD_CHANGE_PATH,
} from "./password-change";

/**
 * Reads the pre-verified auth payload stored in the container by configureContainer.
 * Throws a redirect to /iniciar-sesion if the user is not authenticated.
 *
 * This avoids re-verifying the (potentially expired) cookie token — configureContainer
 * has already handled token validation and silent refresh before the loader runs.
 *
 * Usage:
 *   const auth = await requireAuth(request, context);
 *   // auth.userId, auth.role, auth.email, auth.documentId
 */
export async function requireAuth(
	request: Request,
	context: ICradle,
): Promise<AuthContext> {
	const payload = context.authPayload;

	if (!payload) {
		throw redirect("/iniciar-sesion");
	}

	// Una contraseña que puso otra persona (alta, restablecimiento, bootstrap)
	// se cambia antes de usar la plataforma. Todo lo protegido pasa por aquí.
	if (
		payload.mustChangePassword &&
		!allowsPendingPasswordChange(new URL(request.url).pathname)
	) {
		throw redirect(PASSWORD_CHANGE_PATH);
	}

	return {
		userId: payload.userId,
		documentId: payload.sub,
		email: payload.email,
		role: payload.role,
		dependencyId: payload.dependencyId,
		isTrainer: payload.isTrainer,
		mustChangePassword: payload.mustChangePassword,
	};
}
