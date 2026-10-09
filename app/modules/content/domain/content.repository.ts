import type { CourseScopeWriteWhere } from "@/modules/courses/domain/course.access";
import type { ContentModuleRaw, LessonMaterialRaw } from "./content.mapper";
import type { LessonType } from "./content.rules";
import type {
	ContentCourseRef,
	ContentCreated,
	ContentOrderWrites,
	LessonMaterialWrite,
	LessonWrite,
	ModuleOrderWrite,
	ModuleWrite,
	OrderedRow,
} from "./content.types";

/** El módulo con lo que hace falta para decidir si se puede borrar. */
export interface ContentModuleRef {
	id: number;
	activeLessons: number;
	hasActiveQuiz: boolean;
}

/** La lección con su padre y su clase: borrarla re-empaqueta a sus hermanas. */
export interface ContentLessonRef {
	id: number;
	moduleId: number;
	type: LessonType;
	/** Cambiarlo mueve el porcentaje de avance de todo inscrito. */
	isRequired: boolean;
}

export interface IContentRepository {
	/** El curso si el alcance lo administra; `null` si no. */
	findCourse(
		courseDocumentId: string,
		where: CourseScopeWriteWhere,
	): Promise<ContentCourseRef | null>;
	/** El curso por id, sin alcance: solo para trabajos del sistema. */
	findCourseRef(courseId: number): Promise<ContentCourseRef | null>;
	/** El temario activo del curso, módulos y lecciones en su orden. */
	findTree(courseId: number): Promise<ContentModuleRaw[]>;
	/** `findTree` de varios cursos en una sola consulta, por id de curso. */
	findTrees(
		courseIds: readonly number[],
	): Promise<Map<number, ContentModuleRaw[]>>;
	/** Lo que el checklist de publicación necesita, sin traer el árbol entero. */
	countActiveLessons(courseId: number): Promise<number>;
	/** Preguntas del examen final: el pendiente `quiz` de la publicación. */
	countFinalQuizQuestions(courseId: number): Promise<number>;
	/** Seguimiento sin preguntas (pendiente `followUps`) y el que cuenta para la nota. */
	countFollowUps(
		courseId: number,
	): Promise<{ withoutQuestions: number; counted: number }>;
	/** De estas sesiones, las que tienen una evaluación de seguimiento ya presentada. */
	findSessionsWithFollowUpAttempts(
		sessionDocumentIds: readonly string[],
	): Promise<string[]>;

	/** Hermanos activos ordenados: de ahí salen el tope, la posición y el hueco. */
	findModuleSiblings(courseId: number): Promise<OrderedRow[]>;
	findLessonSiblings(moduleId: number): Promise<OrderedRow[]>;

	/** `null` si no existe, está archivado o es de otro curso. */
	findModule(
		courseId: number,
		moduleDocumentId: string,
	): Promise<ContentModuleRef | null>;
	createModule(courseId: number, data: ModuleWrite): Promise<ContentCreated>;
	updateModule(
		moduleId: number,
		data: Pick<ModuleWrite, "title" | "description">,
	): Promise<void>;
	/**
	 * Borra y re-empaqueta a sus hermanos. Lo que cuelga del módulo se va en
	 * cascada: quien llama comprueba antes que no quede nada que conservar.
	 */
	deleteModule(
		moduleId: number,
		reorder: readonly ModuleOrderWrite[],
	): Promise<void>;

	/** `null` si no existe, está archivada o cuelga de otro curso. */
	findLesson(
		courseId: number,
		lessonDocumentId: string,
	): Promise<ContentLessonRef | null>;
	createLesson(moduleId: number, data: LessonWrite): Promise<ContentCreated>;
	updateLesson(
		lessonId: number,
		data: Omit<LessonWrite, "order">,
	): Promise<void>;
	/** Borra con su material y re-empaqueta a sus hermanas. */
	deleteLesson(
		lessonId: number,
		reorder: readonly ModuleOrderWrite[],
	): Promise<void>;

	/**
	 * El orden de los dos niveles de una vez.
	 *
	 * Quien la llama la envuelve en `runInTransaction`: una permutación a medias
	 * deja el temario con posiciones repetidas.
	 */
	saveOrder(writes: ContentOrderWrites): Promise<void>;

	/** La lección con su material, o `null` si la lección no existe. */
	findMaterial(
		courseId: number,
		lessonDocumentId: string,
	): Promise<LessonMaterialRaw | null>;
	saveMaterial(lessonId: number, data: LessonMaterialWrite): Promise<void>;
	/**
	 * La referencia del objeto que cuelga de la lección, para descartarlo al
	 * reemplazarlo o al borrarla.
	 */
	findMaterialFileUrl(lessonId: number): Promise<string | null>;
}
