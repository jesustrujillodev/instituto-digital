import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { forbiddenRole } from "@/shared/auth/forbidden-role";
import { requireAuth } from "@/shared/auth/require-auth.server";
import type { ICradle } from "@/shared/di/container.types";
import type { Role } from "@/shared/rules/atoms.rules";
import { canParticipate } from "../domain/enrollment.rules";

/** Solo redacta el 403: la condición real también exige pertenecer a una dependencia. */
export const PARTICIPANT_ROLES: readonly Role[] = [
	"USER",
	"DEPENDENCY_HEAD",
	"DEPENDENCY_DEPUTY",
];

export async function requireParticipant(
	request: Request,
	context: ICradle,
): Promise<AuthContext> {
	const auth = await requireAuth(request, context);

	if (!canParticipate(auth)) throw forbiddenRole(PARTICIPANT_ROLES);

	return auth;
}
