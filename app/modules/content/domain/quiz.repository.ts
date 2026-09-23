import type {
	GradedAttempt,
	QuizBankWrite,
	StoredAttempt,
	StoredQuiz,
} from "./quiz.types";

/** Dueño de `quizzes` y sus preguntas, opciones, intentos y respuestas. */
export interface IQuizRepository {
	/** Con `lessonId` nulo, el examen final del curso. */
	findQuiz(
		courseId: number,
		lessonId: number | null,
	): Promise<StoredQuiz | null>;
	countAttempts(quizId: number): Promise<number>;
	/**
	 * Crea el cuestionario si no existe y reescribe sus preguntas y opciones.
	 * Quien la llama la envuelve en `runInTransaction` y ya comprobó que no
	 * tiene intentos.
	 */
	replaceBank(
		courseId: number,
		lessonId: number | null,
		bank: QuizBankWrite,
	): Promise<void>;
	rename(quizId: number, title: string): Promise<void>;

	findAttempt(quizId: number, userId: number): Promise<StoredAttempt | null>;
	/** La unicidad `(quiz, persona)` es la última defensa del intento único. */
	saveAttempt(
		quizId: number,
		userId: number,
		attempt: GradedAttempt,
		at: Date,
	): Promise<void>;
}
