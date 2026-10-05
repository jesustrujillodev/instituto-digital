import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type {
	FollowUpScoreRow,
	FollowUpWrite,
	GradedAttempt,
	QuizAttemptRow,
	QuizBankWrite,
	QuizBoardEntry,
	QuizOwnerIds,
	QuizParticipantRef,
	QuizScoreRow,
	QuizTeachingCourseRef,
	StoredAttempt,
	StoredFollowUp,
	StoredQuiz,
} from "./quiz.types";

/** Dueño de `quizzes` y sus preguntas, opciones, intentos y respuestas. */
export interface IQuizRepository {
	/** El cuestionario activo de ese dueño; todos nulos, el examen final. */
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
	/** Borra con su banco en cascada: solo la evaluación de módulo de un borrador. */
	deleteQuiz(quizId: number): Promise<void>;

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

	/** La mejor nota de cada persona en el examen final. */
	findFinalBestScores(
		courseId: number,
		userIds?: readonly number[],
	): Promise<{ userId: number; score: number }[]>;

	// Evaluaciones de seguimiento (docs/adr/0027).

	/** En el orden de sus sesiones. */
	findFollowUps(courseId: number): Promise<StoredFollowUp[]>;
	/** El banco de cada evaluación de seguimiento, con sus intentos contados. */
	findFollowUpBanks(
		courseId: number,
	): Promise<(StoredQuiz & { attemptCount: number })[]>;
	findFollowUp(
		courseId: number,
		documentId: string,
	): Promise<StoredFollowUp | null>;
	/** La sesión si es de ese curso; `null` si no. */
	findSessionId(
		courseId: number,
		sessionDocumentId: string,
	): Promise<number | null>;
	/** Nace sin preguntas: quien la crea escribe su banco en la misma transacción. */
	createFollowUp(
		courseId: number,
		write: FollowUpWrite,
	): Promise<{ id: number; documentId: string }>;
	updateFollowUp(id: number, write: FollowUpWrite): Promise<void>;
	/** Se lleva sus preguntas; quien llama ya comprobó que no tiene intentos. */
	deleteFollowUp(id: number): Promise<void>;
	openFollowUp(id: number, at: Date): Promise<void>;
	closeFollowUp(id: number, at: Date): Promise<void>;
	/** La mejor nota de cada persona en cada evaluación de seguimiento. */
	findFollowUpBestScores(
		courseId: number,
		userIds?: readonly number[],
	): Promise<FollowUpScoreRow[]>;

	/** El curso si el alcance lo imparte; `null` si no. */
	findTeachingCourse(
		courseDocumentId: string,
		where: TeachingCourseWhere,
	): Promise<QuizTeachingCourseRef | null>;
	/**
	 * Los cuestionarios con preguntas que se presentan: prácticas de lecciones
	 * activas y evaluaciones de módulo activas en el orden del temario, el
	 * seguimiento en el orden de sus sesiones y el examen final al final.
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
