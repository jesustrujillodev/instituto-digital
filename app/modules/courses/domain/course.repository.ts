import type { AccessScope } from "@/shared/auth/scope.rules";
import type { CourseScope } from "./course.access";
import type {
	CourseDetail,
	CourseSummary,
	CreateCourseData,
	ListCoursesDto,
	UpdateCourseData,
} from "./course.types";

/** Una fila ya resuelta a su id interno, tal como la necesita una escritura. */
export interface CourseReference {
	id: number;
	documentId: string;
}

/**
 * El alcance es un PARÁMETRO de cada operación, no un valor inyectado.
 *
 * Fuera de alcance se ve igual que inexistente: las escrituras llevan el filtro
 * junto a la clave única, así que Prisma lanza P2025 y se traduce a
 * `CourseNotFoundError`.
 */
export interface ICourseRepository {
	findAll(
		filters: ListCoursesDto,
		scope: CourseScope,
	): Promise<CourseSummary[]>;
	/** Total con los mismos filtros Y el mismo alcance: comparten el `where`. */
	count(filters: ListCoursesDto, scope: CourseScope): Promise<number>;
	findById(
		documentId: string,
		scope: CourseScope,
	): Promise<CourseDetail | null>;

	/**
	 * Alta del curso con sus sesiones, capacitadores y audiencia.
	 *
	 * Es una escritura compuesta: quien la llama la envuelve en
	 * `runInTransaction`, y los repositorios entran en ella sin conocerla.
	 */
	create(data: CreateCourseData): Promise<CourseDetail>;

	/**
	 * Actualización del curso y de sus tres colecciones.
	 *
	 * Las sesiones se DIFERENCIAN por `documentId` —se conservan, se actualizan,
	 * se borran y se insertan— mientras que capacitadores y audiencia se
	 * reemplazan enteros. La asimetría es deliberada: desde PRD-06 cada sesión
	 * cuelga su asistencia, y recrearlas la dejaría huérfana.
	 */
	update(
		documentId: string,
		data: UpdateCourseData,
		scope: CourseScope,
	): Promise<CourseDetail>;

	publish(documentId: string, scope: CourseScope): Promise<CourseDetail>;
	/** No borra nada: marca el estado y el instante (§6.5). */
	cancel(documentId: string, scope: CourseScope): Promise<CourseDetail>;

	/**
	 * Cuentas con perfil de capacitador ACTIVO, de entre las pedidas.
	 *
	 * Devuelve solo las que cumplen para que el servicio compare contra lo pedido
	 * y rechace el lote entero si sobró alguna, igual que el alta de miembros de
	 * un grupo.
	 */
	findEligibleTrainers(
		userDocumentIds: readonly string[],
	): Promise<CourseReference[]>;
	/** Dependencias activas de entre las pedidas, para la audiencia. */
	findEligibleDependencies(
		documentIds: readonly string[],
	): Promise<CourseReference[]>;
	/**
	 * Grupos activos de entre los pedidos, dentro del alcance de quien elige.
	 *
	 * Lleva alcance y las dependencias no porque un grupo es una lista nominal de
	 * una unidad concreta: verlo es leer a su gente.
	 */
	findEligibleGroups(
		documentIds: readonly string[],
		scope: AccessScope,
	): Promise<CourseReference[]>;
}
