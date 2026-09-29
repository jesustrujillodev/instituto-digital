import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { COURSE_MANAGER_ROLES } from "@/modules/courses/domain/course.access";
import { forbiddenRole } from "@/shared/auth/forbidden-role";
import { requireAuth } from "@/shared/auth/require-auth.server";
import type { ICradle } from "@/shared/di/container.types";
import { sessionMaterialCourseWhere } from "../domain/session-material.rules";

/**
 * Guard del material de sesiones: quien administra el curso o lo imparte. El
 * alcance fino —qué curso— lo aplica el servicio.
 */
export async function requireSessionMaterialScope(
	request: Request,
	context: ICradle,
): Promise<AuthContext> {
	const auth = await requireAuth(request, context);

	if (!sessionMaterialCourseWhere(auth)) {
		throw forbiddenRole(COURSE_MANAGER_ROLES);
	}

	return auth;
}
