import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { CourseScope } from "./course.access";
import type {
	CourseFormOptionsResponse,
	CourseListResponse,
	CourseResponse,
	CreateCourseDto,
	ListCoursesDto,
	UpdateCourseDto,
} from "./course.types";

/**
 * Casos de uso del módulo.
 *
 * Las LECTURAS reciben `scope`; las MUTACIONES reciben el `AuthContext`
 * completo, porque además del alcance necesitan al autor —un capacitador
 * interno solo administra los cursos que él creó, y eso exige saber quién es—.
 */
export interface ICourseService {
	list(
		filters: ListCoursesDto,
		scope: CourseScope,
	): Promise<CourseListResponse>;
	/** Falla con `COURSE_NOT_FOUND` si no existe O si cae fuera del alcance. */
	findById(documentId: string, scope: CourseScope): Promise<CourseResponse>;
	/** Capacitadores, dependencias y grupos que el formulario puede ofrecer. */
	listFormOptions(scope: CourseScope): Promise<CourseFormOptionsResponse>;

	create(dto: CreateCourseDto, actor: AuthContext): Promise<CourseResponse>;
	update(
		documentId: string,
		dto: UpdateCourseDto,
		actor: AuthContext,
	): Promise<CourseResponse>;

	/**
	 * Publica si el curso cumple las cuatro condiciones de §6.5.
	 *
	 * Falla con el código de la condición que faltó, no con uno genérico: es lo
	 * que permite decir QUÉ sesión se quedó sin sede.
	 */
	publish(documentId: string, actor: AuthContext): Promise<CourseResponse>;
	/** Conserva sesiones, capacitadores y audiencia (§6.5). */
	cancel(documentId: string, actor: AuthContext): Promise<CourseResponse>;
}
