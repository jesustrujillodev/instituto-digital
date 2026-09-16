import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { forbiddenRole } from "@/shared/auth/forbidden-role";
import { requireAuth } from "@/shared/auth/require-auth.server";
import type { ICradle } from "@/shared/di/container.types";
import { canTeach, resolveTeachingScope } from "../domain/teaching.access";
import { TEACHING_ROLES } from "../domain/teaching.config";

/**
 * Guard de la impartición. Como en cursos, la condición no es un rol —cualquier
 * capacitador entra— y el 403 sale de `forbiddenRole` para que sea idéntico al
 * de `requireRole`.
 */
export async function requireTeaching(
	request: Request,
	context: ICradle,
): Promise<AuthContext> {
	const auth = await requireAuth(request, context);

	if (!canTeach(resolveTeachingScope(auth))) {
		throw forbiddenRole(TEACHING_ROLES);
	}

	return auth;
}
