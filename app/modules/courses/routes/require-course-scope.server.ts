import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { forbiddenRole } from "@/shared/auth/forbidden-role";
import { requireAuth } from "@/shared/auth/require-auth.server";
import type { ICradle } from "@/shared/di/container.types";
import {
	COURSE_MANAGER_ROLES,
	type CourseScope,
	canManageCourses,
	resolveCourseScope,
} from "../domain/course.access";

/**
 * Guard de las rutas de cursos: autenticación, permiso y alcance en un acto.
 *
 * No puede delegar en `requireScope` porque la matriz de §3 deja crear cursos
 * al capacitador interno, que suele tener rol `USER`: esa condición no es un
 * rol. El 403 sale de `forbiddenRole` para que sea idéntico al de
 * `requireRole`, igual que en el catálogo de capacitadores.
 */
export async function requireCourseScope(
	request: Request,
	context: ICradle,
): Promise<{ auth: AuthContext; scope: CourseScope }> {
	const auth = await requireAuth(request, context);

	if (!canManageCourses(auth)) throw forbiddenRole(COURSE_MANAGER_ROLES);

	return { auth, scope: resolveCourseScope(auth) };
}
