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
	/**
	 * Las lecciones activas completadas en el curso; con `userIds`, solo las de
	 * esas personas.
	 */
	findCompletedLessons(
		courseId: number,
		userIds?: readonly number[],
	): Promise<CompletedLessonRow[]>;
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
	findClassroomCourses(userId: number): Promise<string[]>;
}
