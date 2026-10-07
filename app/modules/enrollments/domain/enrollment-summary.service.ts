import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	MyCoursesDigest,
	MyCoursesDigestLimits,
	OpenEnrollmentSummary,
} from "./enrollment-summary.types";

/** Lecturas resumidas de inscripción para el panel de inicio. */
export interface IEnrollmentSummaryService {
	/**
	 * «Mis cursos» reducido a lo que pide una acción. Mismo guard y mismo
	 * alcance que `listMine`: falla con `ENROLLMENT_NOT_ELIGIBLE`.
	 */
	summarizeMine(
		actor: AuthContext,
		limits: MyCoursesDigestLimits,
	): Promise<AppResponse<MyCoursesDigest>>;
	/**
	 * Cursos que el actor organiza con la inscripción abierta. Falla con
	 * `ENROLLMENT_FORBIDDEN_SCOPE` si no organiza ninguno.
	 */
	summarizeOpen(
		actor: AuthContext,
		options: { limit: number },
	): Promise<AppResponse<OpenEnrollmentSummary>>;
}
