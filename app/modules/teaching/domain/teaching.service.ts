import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	CompletionSyncResult,
	FinishResponse,
	IssueCertificatesResponse,
	ListTeachingCoursesDto,
	SaveAttendanceDto,
	SaveResultsDto,
	SetEnrollmentOpenDto,
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
	/** Marca `FINISHED`, calcula quién completó y otorga créditos y certificados. */
	finish(documentId: string, actor: AuthContext): Promise<FinishResponse>;
	/**
	 * Vuelve a sincronizar el completado para emitir lo que falte: lo completado
	 * antes de que existieran los certificados. Idempotente.
	 */
	issueCertificates(
		documentId: string,
		actor: AuthContext,
	): Promise<IssueCertificatesResponse>;
	/** El cierre de un autogestivo: deja de admitir gente, o vuelve a hacerlo. */
	setEnrollmentOpen(
		documentId: string,
		dto: SetEnrollmentOpenDto,
		actor: AuthContext,
	): Promise<TeachingWriteResponse>;
}

/**
 * Recalcula quién completó un curso y deja sus créditos y certificados igual
 * que el cálculo.
 *
 * No es un caso de uso sino la pieza que comparten los que escriben algo que
 * decide el completado: el cierre, la corrección, el resultado de un autogestivo
 * y el avance por lección (docs/adr/0014). Se llama siempre dentro de la
 * transacción de quien escribe y con la fila del curso bloqueada.
 */
export interface ICompletionSync {
	sync(
		courseId: number,
		actorId: number,
		at: Date,
	): Promise<CompletionSyncResult>;
}
