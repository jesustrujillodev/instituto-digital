import type { CourseScopeWriteWhere } from "@/modules/courses/domain/course.access";
import type { ContentModuleRaw, LessonMaterialRaw } from "./content.mapper";
import type { LessonType } from "./content.rules";
import type {
	ContentCourseRef,
	ContentOrderWrites,
	LessonMaterialWrite,
	LessonWrite,
	ModuleOrderWrite,
	ModuleWrite,
	OrderedRow,
} from "./content.types";

/** El módulo con lo que hace falta para decidir si se puede archivar. */
export interface ContentModuleRef {
	id: number;
	activeLessons: number;
	hasActiveQuiz: boolean;
}

/** La lección con su padre y su clase: archivarla re-empaqueta a sus hermanas. */
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
	/** El temario activo del curso, módulos y lecciones en su orden. */
	findTree(courseId: number): Promise<ContentModuleRaw[]>;
	/** Lo que el checklist de publicación necesita, sin traer el árbol entero. */
	countActiveLessons(courseId: number): Promise<number>;
	/** Preguntas del examen final: el pendiente `quiz` de la publicación. */
	countFinalQuizQuestions(courseId: number): Promise<number>;

	/** Hermanos activos ordenados: de ahí salen el tope, la posición y el hueco. */
	findModuleSiblings(courseId: number): Promise<OrderedRow[]>;
	findLessonSiblings(moduleId: number): Promise<OrderedRow[]>;

	/** `null` si no existe, está archivado o es de otro curso. */
	findModule(
		courseId: number,
		moduleDocumentId: string,
	): Promise<ContentModuleRef | null>;
	createModule(courseId: number, data: ModuleWrite): Promise<void>;
	updateModule(
		moduleId: number,
		data: Pick<ModuleWrite, "title" | "description">,
	): Promise<void>;
	/** Archiva y re-empaqueta a sus hermanos en la misma transacción. */
	archiveModule(
		moduleId: number,
		at: Date,
		reorder: readonly ModuleOrderWrite[],
	): Promise<void>;

	/** `null` si no existe, está archivada o cuelga de otro curso. */
	findLesson(
		courseId: number,
		lessonDocumentId: string,
	): Promise<ContentLessonRef | null>;
	createLesson(moduleId: number, data: LessonWrite): Promise<void>;
	updateLesson(
		lessonId: number,
		data: Omit<LessonWrite, "order">,
	): Promise<void>;
	archiveLesson(
		lessonId: number,
		at: Date,
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
	 * reemplazarlo o al archivarla.
	 */
	findMaterialFileUrl(lessonId: number): Promise<string | null>;
}
