import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type {
	ClassroomCoursesResponse,
	ClassroomLessonResponse,
	ClassroomResponse,
	ProgressResponse,
	ProgressState,
	RecordProgressDto,
} from "./classroom.types";
import type { LessonMaterial } from "./content.types";

/** El aula del participante: recorrer el temario y registrar su avance. */
export interface IClassroomService {
	findClassroom(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ClassroomResponse>;
	/** Solo lee: abrir una lección se registra aparte, con `recordProgress`. */
	findLesson(
		courseDocumentId: string,
		lessonDocumentId: string,
		actor: AuthContext,
	): Promise<ClassroomLessonResponse>;
	recordProgress(
		courseDocumentId: string,
		dto: RecordProgressDto,
		actor: AuthContext,
	): Promise<ProgressResponse>;
	/** Los `documentId` de los cursos de la persona que tienen aula. */
	listMine(actor: AuthContext): Promise<ClassroomCoursesResponse>;
}

/**
 * La lectura del material con su URL firmada. La comparten quien edita la
 * lección y quien la recorre: firmar es lo mismo para los dos.
 */
export interface ILessonMaterialReader {
	sign(material: LessonMaterial): Promise<LessonMaterial>;
}

/**
 * La única vía que escribe el caché del avance (docs/adr/0014).
 *
 * Recalcula el porcentaje de las inscripciones activas, fija
 * `contentCompletedAt` a quien acaba de terminar y, si el curso completa en
 * vivo, recalcula el completado y los créditos. Se llama dentro de la
 * transacción de quien escribe.
 */
export interface IProgressSync {
	recalculate(
		course: { id: number; status: CourseStatus; format: CourseFormat },
		actorId: number,
		at: Date,
		userIds?: readonly number[],
	): Promise<ProgressState[]>;
}
