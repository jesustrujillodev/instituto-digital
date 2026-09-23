import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type {
	GradedAttempt,
	ModuleQuizAttemptRow,
	ModuleQuizBoardEntry,
	PassedModuleQuizRow,
	QuizBankWrite,
	QuizOwnerIds,
	QuizTeachingCourseRef,
	StoredAttempt,
	StoredQuiz,
} from "./quiz.types";

/** Dueño de `quizzes` y sus preguntas, opciones, intentos y respuestas. */
export interface IQuizRepository {
	/** El cuestionario activo de ese dueño; los dos nulos, el examen final. */
	findQuiz(courseId: number, owner: QuizOwnerIds): Promise<StoredQuiz | null>;
	countAttempts(quizId: number): Promise<number>;
	/**
	 * Crea el cuestionario si no existe y reescribe sus preguntas y opciones.
	 * Quien la llama la envuelve en `runInTransaction` y ya comprobó que no
	 * tiene intentos.
	 */
	replaceBank(
		courseId: number,
		owner: QuizOwnerIds,
		bank: QuizBankWrite,
	): Promise<void>;
	rename(quizId: number, title: string): Promise<void>;
	/** Deja de contar sin borrar los intentos que respaldan completados ya dados. */
	archive(quizId: number, at: Date): Promise<void>;

	/** El último intento de la persona, o `null` si nunca lo presentó. */
	findAttempt(quizId: number, userId: number): Promise<StoredAttempt | null>;
	/** La unicidad `(quiz, persona, número)` es la última defensa del doble envío. */
	saveAttempt(
		quizId: number,
		userId: number,
		number: number,
		attempt: GradedAttempt,
		at: Date,
	): Promise<void>;
	grantRetake(attemptId: number, actorId: number, at: Date): Promise<void>;

	/**
	 * Los cuestionarios de módulo activos, de módulos activos, que alguien
	 * aprobó; con `userIds`, solo los de esas personas.
	 */
	findPassedModuleQuizzes(
		courseId: number,
		userIds?: readonly number[],
	): Promise<PassedModuleQuizRow[]>;

	/** El curso si el alcance lo imparte; `null` si no. */
	findTeachingCourse(
		courseDocumentId: string,
		where: TeachingCourseWhere,
	): Promise<QuizTeachingCourseRef | null>;
	/** Los cuestionarios de módulo activos, en el orden del temario. */
	findModuleQuizzes(courseId: number): Promise<ModuleQuizBoardEntry[]>;
	/**
	 * El último intento de cada persona en cada cuestionario de módulo activo;
	 * con `userId`, solo los de esa persona.
	 */
	findLatestModuleAttempts(
		courseId: number,
		userId?: number,
	): Promise<ModuleQuizAttemptRow[]>;
	/** La persona si tiene inscripción activa en el curso. */
	findEnrolledUserId(
		courseId: number,
		userDocumentId: string,
	): Promise<number | null>;
}
