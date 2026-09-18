import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { UploadInput } from "@/shared/storage/upload-validation";
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

	/**
	 * La portada viaja aparte del DTO y no dentro de él: un `File` no existe en
	 * el servidor con el mismo tipo que en el navegador, así que meterlo en el
	 * contrato de validación —que corre en los dos lados— lo partiría en dos.
	 *
	 * Subida y escritura son una sola unidad: si la fila falla, el objeto se
	 * revierte. Quitar la portada de un curso que ya la tiene viaja en el DTO,
	 * como `removeCover`.
	 */
	create(
		dto: CreateCourseDto,
		actor: AuthContext,
		cover?: UploadInput | null,
	): Promise<CourseResponse>;
	update(
		documentId: string,
		dto: UpdateCourseDto,
		actor: AuthContext,
		cover?: UploadInput | null,
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
