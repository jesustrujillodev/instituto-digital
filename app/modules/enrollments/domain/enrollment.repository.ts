import type {
	CourseScopeWhere,
	CourseScopeWriteWhere,
	courseVisibilityWhere,
	dependencyVisibilityWhere,
} from "@/modules/courses/domain/course.access";
import type { CatalogAccessWhere } from "./enrollment.access";
import type { EnrollmentStatus } from "./enrollment.config";
import type {
	AvailableCourseRow,
	CandidateAccount,
	CourseOrganizerOption,
	EnrollmentCourse,
	EnrollmentState,
	EnrollmentWrite,
	ListAvailableCoursesDto,
	MyCourseRecord,
	NotifiableParticipant,
	ParticipantAccount,
	ParticipantEnrollment,
	ProgressState,
	ProgressWrite,
	ResultWrite,
	RosterEntry,
	StoredEnrollment,
} from "./enrollment.types";

/** Filtros de curso que el servicio ya resolvió desde el alcance o la visibilidad. */
export type CourseFilter =
	| ReturnType<typeof courseVisibilityWhere>
	| ReturnType<typeof dependencyVisibilityWhere>
	| CourseScopeWhere
	| CourseScopeWriteWhere
	| CatalogFilter;

/** Lo que la persona ve (`courseVisibilityWhere`) y el catálogo le ofrece. */
export type CatalogFilter = {
	AND: [ReturnType<typeof courseVisibilityWhere>, CatalogAccessWhere];
};

export interface IEnrollmentRepository {
	/** El curso si cumple el filtro; si no, `null`, igual que si no existiera. */
	findCourse(
		documentId: string,
		filter: CourseFilter,
	): Promise<EnrollmentCourse | null>;

	/**
	 * Publicados, dentro del catálogo de quien mira y con la inscripción abierta
	 * en `now`. `userId` solo trae su estado en cada curso.
	 */
	findAvailable(params: {
		filters: ListAvailableCoursesDto;
		filter: CatalogFilter;
		now: Date;
		userId: number;
	}): Promise<AvailableCourseRow[]>;
	countAvailable(params: {
		filters: ListAvailableCoursesDto;
		filter: CatalogFilter;
		now: Date;
	}): Promise<number>;
	/**
	 * Dependencias que organizan algún curso disponible para quien mira.
	 *
	 * Son las opciones del filtro del catálogo, y salen del mismo conjunto que
	 * las tarjetas: ofrecer todas las dependencias activas llenaría el selector
	 * de opciones que no devuelven nada.
	 */
	findAvailableOrganizers(params: {
		filters: ListAvailableCoursesDto;
		filter: CatalogFilter;
		now: Date;
	}): Promise<CourseOrganizerOption[]>;

	findEnrollment(
		courseId: number,
		userId: number,
	): Promise<StoredEnrollment | null>;
	/** `findEnrollment` por el documentId del curso, sin leerlo antes. */
	findEnrollmentByCourseDocumentId(
		courseDocumentId: string,
		userId: number,
	): Promise<StoredEnrollment | null>;
	findEnrollments(
		courseId: number,
		userIds: readonly number[],
	): Promise<EnrollmentState[]>;
	/** La inscripción de esa persona en el curso, con su contacto para avisarle. */
	findParticipantEnrollment(
		courseId: number,
		userDocumentId: string,
	): Promise<ParticipantEnrollment | null>;

	/**
	 * Bloquea la fila del curso hasta el final de la transacción, sin leer nada
	 * más. Solo tiene sentido dentro de `runInTransaction`.
	 */
	lockCourse(courseId: number): Promise<void>;

	/**
	 * `lockCourse` y, ya con el bloqueo, el cupo y los inscritos. Solo tiene
	 * sentido dentro de `runInTransaction`.
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
	 * `save` de un lote en pocas sentencias, con el mismo resultado y el mismo
	 * error: si alguna fila ya no está como se esperaba, lanza
	 * `EnrollmentStateChangedError` y la transacción de quien llama revierte
	 * el lote entero.
	 */
	saveMany(
		writes: readonly {
			data: EnrollmentWrite;
			expected: EnrollmentStatus | null;
		}[],
	): Promise<void>;

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
	/**
	 * El avance cacheado de las inscripciones activas del curso; con `userIds`,
	 * solo el de esas personas.
	 */
	findProgressStates(
		courseId: number,
		userIds?: readonly number[],
	): Promise<ProgressState[]>;
	/**
	 * La caché del avance, escrita por `content` dentro de su transacción. El
	 * porcentaje se reescribe siempre; `contentCompletedAt` solo si estaba vacío,
	 * porque no se borra (docs/adr/0014).
	 */
	saveProgress(
		courseId: number,
		writes: readonly ProgressWrite[],
	): Promise<void>;
	/**
	 * «No presentó»: los `ENROLLED` todavía en `PENDING` pasan a `FAILED` sin
	 * nota. Lo llama el cierre de un curso evaluado por examen (docs/adr/0015).
	 */
	markPendingAsFailed(
		courseId: number,
		actorId: number,
		at: Date,
	): Promise<void>;
	/** `completed` según el último cálculo; solo toca a los `ENROLLED`. */
	setCompletion(
		courseId: number,
		completedUserIds: readonly number[],
	): Promise<void>;

	/** Inscritos e invitados pendientes con cuenta activa. */
	findNotifiableRecipients(courseId: number): Promise<NotifiableParticipant[]>;

	/** Invitaciones pendientes, inscripciones activas y bajas de la persona. */
	findMine(userId: number): Promise<MyCourseRecord[]>;
	/** Su inscripción en el curso, si es de las que enseña «Mis cursos». */
	findMyCourse(
		userId: number,
		courseDocumentId: string,
	): Promise<MyCourseRecord | null>;
	/** Con `dependencyId`, solo quienes se inscribieron con esa dependencia. */
	findRoster(
		courseId: number,
		dependencyId: number | null,
	): Promise<RosterEntry[]>;
	/** Invitaciones sin responder, con el mismo filtro que `findRoster`. */
	countInvited(courseId: number, dependencyId: number | null): Promise<number>;

	/** Cuentas internas y activas de entre las pedidas; con `dependencyId`, solo de esa dependencia. */
	findParticipants(
		userDocumentIds: readonly string[],
		dependencyId: number | null,
	): Promise<ParticipantAccount[]>;
	/**
	 * Miembros internos y activos de los grupos que siguen en la dependencia del
	 * grupo; cada persona una vez.
	 */
	findGroupParticipants(
		groupIds: readonly number[],
	): Promise<ParticipantAccount[]>;
	/**
	 * Por grupo, los miembros internos y activos que siguen en la dependencia del
	 * grupo y aún no están inscritos al curso; con `dependencyId`, solo los de
	 * esa dependencia.
	 */
	findGroupEnrollable(params: {
		courseId: number;
		groupIds: readonly number[];
		dependencyId: number | null;
	}): Promise<{ groupId: number; userDocumentId: string }[]>;
	/** Personas sin invitación pendiente ni inscripción activa en el curso. */
	searchCandidates(params: {
		courseId: number;
		dependencyId: number | null;
		search?: string;
	}): Promise<CandidateAccount[]>;
}
