import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	AssignParticipantsDto,
	AvailableCourseDetailResponse,
	AvailableCourseListResponse,
	BatchResultResponse,
	CourseRosterResponse,
	EnrollmentMutationResponse,
	InviteParticipantsDto,
	ListAvailableCoursesDto,
	MyCoursesResponse,
	RosterOptionsResponse,
} from "./enrollment.types";

/**
 * Casos de uso de inscripción. Todas las operaciones reciben el `AuthContext`:
 * lo que alguien ve depende de quién es, no solo de su alcance.
 */
export interface IEnrollmentService {
	listAvailable(
		filters: ListAvailableCoursesDto,
		actor: AuthContext,
	): Promise<AvailableCourseListResponse>;
	/** Falla con `ENROLLMENT_COURSE_NOT_FOUND` si quien pregunta no puede verlo. */
	findAvailable(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<AvailableCourseDetailResponse>;
	listMine(actor: AuthContext): Promise<MyCoursesResponse>;
	/**
	 * Quien organiza ve a todas las personas; una dependencia que manda personal
	 * a un curso ajeno, solo a la suya.
	 */
	listRoster(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<CourseRosterResponse>;
	listRosterOptions(
		courseDocumentId: string,
		search: string | undefined,
		actor: AuthContext,
	): Promise<RosterOptionsResponse>;

	enroll(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<EnrollmentMutationResponse>;
	withdraw(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<EnrollmentMutationResponse>;
	accept(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<EnrollmentMutationResponse>;
	decline(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<EnrollmentMutationResponse>;
	/**
	 * Inscribe personas y miembros de grupos. Todo o nada: si falta cupo para el
	 * lote, no inscribe a nadie. Los miembros fuera de su alcance se omiten.
	 */
	assign(
		courseDocumentId: string,
		dto: AssignParticipantsDto,
		actor: AuthContext,
	): Promise<BatchResultResponse>;
	/**
	 * Solo en cursos por invitación. No ocupa cupo; omite a quien ya tiene
	 * invitación o inscripción activa.
	 */
	invite(
		courseDocumentId: string,
		dto: InviteParticipantsDto,
		actor: AuthContext,
	): Promise<BatchResultResponse>;
}
