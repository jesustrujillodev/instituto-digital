import type {
	CourseScopeWhere,
	CourseScopeWriteWhere,
	courseVisibilityWhere,
	dependencyVisibilityWhere,
} from "@/modules/courses/domain/course.access";
import type { EnrollmentStatus } from "./enrollment.config";
import type {
	AvailableCourseRow,
	EnrollmentCourse,
	EnrollmentState,
	EnrollmentWrite,
	ListAvailableCoursesDto,
	MyCourseRecord,
	ParticipantAccount,
	ParticipantCandidate,
	ResultWrite,
	RosterEntry,
	StoredEnrollment,
} from "./enrollment.types";

/** Filtros de curso que el servicio ya resolvió desde el alcance o la visibilidad. */
export type CourseFilter =
	| ReturnType<typeof courseVisibilityWhere>
	| ReturnType<typeof dependencyVisibilityWhere>
	| CourseScopeWhere
	| CourseScopeWriteWhere;

export interface IEnrollmentRepository {
	/** El curso si cumple el filtro; si no, `null`, igual que si no existiera. */
	findCourse(
		documentId: string,
		filter: CourseFilter,
	): Promise<EnrollmentCourse | null>;

	/** Publicados, visibles y con la inscripción abierta en `now`. */
	findAvailable(params: {
		filters: ListAvailableCoursesDto;
		filter: CourseFilter;
		now: Date;
		userId: number;
	}): Promise<AvailableCourseRow[]>;
	countAvailable(params: {
		filters: ListAvailableCoursesDto;
		filter: CourseFilter;
		now: Date;
	}): Promise<number>;

	findEnrollment(
		courseId: number,
		userId: number,
	): Promise<StoredEnrollment | null>;
	findEnrollments(
		courseId: number,
		userIds: readonly number[],
	): Promise<EnrollmentState[]>;

	/**
	 * Bloquea la fila del curso hasta el final de la transacción y cuenta los
	 * inscritos. Solo tiene sentido dentro de `runInTransaction`.
	 */
	lockCourseSeats(
		courseId: number,
	): Promise<{ capacity: number | null; enrolled: number }>;

	/**
	 * Crea la inscripción si `expected` es `null`; si no, la actualiza solo si
	 * sigue en ese estado. Lanza `EnrollmentStateChangedError` si otra petición
	 * se adelantó.
	 */
	save(data: EnrollmentWrite, expected: EnrollmentStatus | null): Promise<void>;

	/**
	 * Resultado y nota de inscritos, con quién y cuándo (§6.8). La escribe
	 * `teaching`, dentro de su transacción: la fila es de este módulo.
	 */
	saveResults(
		courseId: number,
		entries: readonly ResultWrite[],
		actorId: number,
		at: Date,
	): Promise<void>;
	/** `completed` según el último cálculo; solo toca a los `ENROLLED`. */
	setCompletion(
		courseId: number,
		completedUserIds: readonly number[],
	): Promise<void>;

	/** Invitaciones pendientes e inscripciones activas de la persona. */
	findMine(userId: number): Promise<MyCourseRecord[]>;
	findRoster(courseId: number): Promise<RosterEntry[]>;

	/** Cuentas internas y activas de entre las pedidas; con `dependencyId`, solo de esa dependencia. */
	findParticipants(
		userDocumentIds: readonly string[],
		dependencyId: number | null,
	): Promise<ParticipantAccount[]>;
	/** Miembros internos y activos de los grupos. */
	findGroupParticipants(
		groupIds: readonly number[],
	): Promise<ParticipantAccount[]>;
	/** Personas sin invitación pendiente ni inscripción activa en el curso. */
	searchCandidates(params: {
		courseId: number;
		dependencyId: number | null;
		search?: string;
	}): Promise<ParticipantCandidate[]>;
}
