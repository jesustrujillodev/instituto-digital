import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	FinishResponse,
	ListTeachingCoursesDto,
	SaveAttendanceDto,
	SaveResultsDto,
	TeachingCourseListResponse,
	TeachingDetailResponse,
	TeachingWriteResponse,
} from "./teaching.types";

/**
 * Pase de lista, resultados, cierre y corrección (§6.8).
 *
 * Una escritura sobre un curso finalizado ES la corrección posterior: recalcula
 * quién completó y ajusta los créditos en la misma transacción.
 */
export interface ITeachingService {
	listCourses(
		filters: ListTeachingCoursesDto,
		actor: AuthContext,
	): Promise<TeachingCourseListResponse>;
	/** Falla con `TEACHING_COURSE_NOT_FOUND` si no lo imparte ni lo organiza. */
	findById(
		documentId: string,
		actor: AuthContext,
	): Promise<TeachingDetailResponse>;

	saveAttendance(
		documentId: string,
		dto: SaveAttendanceDto,
		actor: AuthContext,
	): Promise<TeachingWriteResponse>;
	saveResults(
		documentId: string,
		dto: SaveResultsDto,
		actor: AuthContext,
	): Promise<TeachingWriteResponse>;
	/** Marca `FINISHED`, calcula quién completó y otorga los créditos. */
	finish(documentId: string, actor: AuthContext): Promise<FinishResponse>;
}
