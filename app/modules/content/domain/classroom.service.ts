import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	ClassroomCoursesResponse,
	ClassroomLessonResponse,
	ClassroomModuleQuizResponse,
	ClassroomResponse,
	ClassroomSummariesResponse,
	ProgressResponse,
	ProgressState,
	RecordProgressDto,
} from "./classroom.types";
import type { ContentCourseRef, LessonMaterial } from "./content.types";

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
	/** Dónde cae la evaluación de un módulo en el recorrido; la hoja la da `quizService`. */
	findModuleQuiz(
		courseDocumentId: string,
		moduleDocumentId: string,
		actor: AuthContext,
	): Promise<ClassroomModuleQuizResponse>;
	recordProgress(
		courseDocumentId: string,
		dto: RecordProgressDto,
		actor: AuthContext,
	): Promise<ProgressResponse>;
	/** Los `documentId` de los cursos de la persona que tienen aula. */
	listMine(actor: AuthContext): Promise<ClassroomCoursesResponse>;
	/** Como `listMine`, con cuánto lleva de cada temario: lo pinta «Mis cursos». */
	summarizeMine(actor: AuthContext): Promise<ClassroomSummariesResponse>;
}

/**
 * La lectura del material con su URL firmada. La comparten quien edita la
 * lección y quien la recorre: firmar es lo mismo para los dos.
 */
export interface ILessonMaterialReader {
	sign(material: LessonMaterial): Promise<LessonMaterial>;
	/** La misma firma para cualquier material subido: el de una sesión, también. */
	signReference(
		reference: string,
	): Promise<{ fileUrl: string; downloadUrl: string } | null>;
	/** Varias referencias en un solo lote; `null` donde no hay objeto que firmar. */
	signReferences(
		references: readonly string[],
	): Promise<Map<string, { fileUrl: string; downloadUrl: string } | null>>;
}

/**
 * La única vía que escribe el caché del avance (docs/adr/0014) y la nota que
 * se calcula sola (docs/adr/0024, 0027).
 *
 * Recalcula el porcentaje de las inscripciones activas, fija
 * `contentCompletedAt` a quien acaba de terminar, califica con el promedio a
 * quien ya tiene con qué y todavía no completó y, si el curso completa en
 * vivo, recalcula el completado y los créditos. Se llama dentro de la
 * transacción de quien escribe.
 *
 * Con `closing`, el curso se está finalizando: toda evaluación de seguimiento
 * se da por cerrada y quien no la presentó, si cuenta, saca 0.
 */
export interface IProgressSync {
	recalculate(
		course: ContentCourseRef,
		actorId: number,
		at: Date,
		userIds?: readonly number[],
		options?: { closing?: boolean },
	): Promise<ProgressState[]>;
}
