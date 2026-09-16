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
	ParticipantCandidatesResponse,
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
	/** Personal de la dependencia del actor al que puede asignar al curso. */
	listAssignCandidates(
		courseDocumentId: string,
		search: string | undefined,
		actor: AuthContext,
	): Promise<ParticipantCandidatesResponse>;

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
	/** Todo o nada: si falta cupo para el lote, no inscribe a nadie. */
	assign(
		courseDocumentId: string,
		dto: AssignParticipantsDto,
		actor: AuthContext,
	): Promise<BatchResultResponse>;
	/** No ocupa cupo; omite a quien ya tiene invitación o inscripción activa. */
	invite(
		courseDocumentId: string,
		dto: InviteParticipantsDto,
		actor: AuthContext,
	): Promise<BatchResultResponse>;
}
