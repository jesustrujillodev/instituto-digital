import type { TeachingCourseWhere } from "./teaching.access";
import type {
	AttendanceMark,
	ListTeachingCoursesDto,
	TeachingCourse,
	TeachingCourseSummary,
} from "./teaching.types";

/**
 * Dueño de `course_attendance`. Lo demás que escribe la impartición —estado del
 * curso, resultados y créditos— pasa por el repositorio del módulo dueño de
 * cada tabla (docs/adr/0006).
 */
export interface ITeachingRepository {
	/** Publicados y finalizados dentro del filtro. */
	findCourses(
		filters: ListTeachingCoursesDto,
		where: TeachingCourseWhere,
	): Promise<TeachingCourseSummary[]>;
	countCourses(
		filters: ListTeachingCoursesDto,
		where: TeachingCourseWhere,
	): Promise<number>;

	/** Publicado o finalizado dentro del filtro; si no, `null`. */
	findCourse(
		documentId: string,
		where: TeachingCourseWhere,
	): Promise<TeachingCourse | null>;
	/**
	 * Relectura sin filtro para usarla dentro de la transacción, ya autorizada y
	 * con la fila del curso bloqueada.
	 */
	findCourseById(courseId: number): Promise<TeachingCourse>;

	/** Inserta o reescribe la marca de cada persona en la sesión. */
	saveAttendance(
		sessionId: number,
		marks: readonly AttendanceMark[],
		actorId: number,
		at: Date,
	): Promise<void>;

	/**
	 * Auto-registro por QR: marca presente a la propia persona.
	 *
	 * Devuelve `false` si ya había una marca de asistencia por QR, sin
	 * reescribirla — así `recordedAt` conserva el primer escaneo y la pantalla
	 * puede decir "ya estaba registrada". Una marca manual de ausencia SÍ se
	 * sobreescribe: quien llega tarde al pase de lista se registra él mismo.
	 */
	checkIn(sessionId: number, userId: number, at: Date): Promise<boolean>;
}
