import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type {
	GradedAttempt,
	QuizAttemptRow,
	QuizBankWrite,
	QuizBoardEntry,
	QuizOwnerIds,
	QuizParticipantRef,
	QuizScoreRow,
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
	/** La mejor nota de la persona en ese cuestionario; `null` sin intentos. */
	findBestScore(quizId: number, userId: number): Promise<number | null>;
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
	 * Las prácticas y los cuestionarios de módulo activos, de módulos activos,
	 * que alguien presentó, con su mejor nota; con `userIds`, solo los de esas
	 * personas.
	 */
	findBestScores(
		courseId: number,
		userIds?: readonly number[],
	): Promise<QuizScoreRow[]>;

	/** El curso si el alcance lo imparte; `null` si no. */
	findTeachingCourse(
		courseDocumentId: string,
		where: TeachingCourseWhere,
	): Promise<QuizTeachingCourseRef | null>;
	/**
	 * Los cuestionarios con preguntas que se presentan: prácticas de lecciones
	 * activas y evaluaciones de módulo activas en el orden del temario, y el
	 * examen final al final.
	 */
	findBoardQuizzes(courseId: number): Promise<QuizBoardEntry[]>;
	/**
	 * El último intento de cada persona en cada uno de esos cuestionarios; con
	 * `userId`, solo los de esa persona.
	 */
	findLatestAttempts(
		courseId: number,
		userId?: number,
	): Promise<QuizAttemptRow[]>;
	/** La persona si tiene inscripción activa en el curso, con su resultado. */
	findEnrolledParticipant(
		courseId: number,
		userDocumentId: string,
	): Promise<QuizParticipantRef | null>;
}
