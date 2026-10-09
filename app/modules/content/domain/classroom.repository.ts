import type { LessonProgressStatus } from "./classroom.rules";
import type {
	ClassroomCourse,
	CompletedLessonRow,
	LessonProgressRow,
} from "./classroom.types";

/** Dueño de `lesson_progress`. El caché de la inscripción es de `enrollments`. */
export interface IClassroomRepository {
	/** El curso con la inscripción de esa persona, o `null` si no existe. */
	findCourse(
		courseDocumentId: string,
		userId: number,
	): Promise<ClassroomCourse | null>;
	/** El avance de una persona en las lecciones activas del curso. */
	findProgress(courseId: number, userId: number): Promise<LessonProgressRow[]>;
	/** El estado de una lección en `findProgress`, sin leer las demás. */
	findLessonStatus(
		courseId: number,
		lessonId: number,
		userId: number,
	): Promise<LessonProgressStatus | null>;
	/**
	 * Las lecciones activas completadas en el curso; con `userIds`, solo las de
	 * esas personas.
	 */
	findCompletedLessons(
		courseId: number,
		userIds?: readonly number[],
	): Promise<CompletedLessonRow[]>;
	/** `findCompletedLessons` de varios cursos en una sola consulta, por id de curso. */
	findCompletedLessonsIn(
		courseIds: readonly number[],
		userIds: readonly number[],
	): Promise<Map<number, CompletedLessonRow[]>>;
	/** Inserta o reescribe; `completedAt` se fija solo la primera vez. */
	saveProgress(
		lessonId: number,
		userId: number,
		status: LessonProgressStatus,
		at: Date,
	): Promise<void>;
	/**
	 * Los cursos de la persona que tienen aula: inscripción activa, publicados o
	 * finalizados, y con al menos una lección activa.
	 */
	findClassroomCourses(
		userId: number,
	): Promise<{ id: number; documentId: string }[]>;
}
