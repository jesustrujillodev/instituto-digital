import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	QuizBankResponse,
	QuizMutationResponse,
	QuizOutcomeResponse,
	QuizViewResponse,
	RenameQuizDto,
	SaveQuizDto,
	SubmitQuizDto,
} from "./quiz.types";

/**
 * Los cuestionarios autocalificados (docs/adr/0015). `lessonDocumentId` nulo es
 * el examen final del curso; con valor, la práctica de esa lección `QUIZ`.
 */
export interface IQuizService {
	/** El banco para quien lo arma, con las respuestas correctas. */
	findBank(
		courseDocumentId: string,
		lessonDocumentId: string | null,
		actor: AuthContext,
	): Promise<QuizBankResponse>;
	/** Reescribe el banco entero. Solo mientras nadie lo haya presentado. */
	saveBank(
		courseDocumentId: string,
		dto: SaveQuizDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;
	/** El título se corrige aunque el banco ya esté congelado. */
	renameQuiz(
		courseDocumentId: string,
		dto: RenameQuizDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;

	/** Para quien lo presenta, sin respuestas correctas. `null` si no hay qué presentar. */
	findView(
		courseDocumentId: string,
		lessonDocumentId: string | null,
		actor: AuthContext,
	): Promise<QuizViewResponse>;
	/** Califica, guarda el intento único y aplica su efecto. */
	submit(
		courseDocumentId: string,
		dto: SubmitQuizDto,
		actor: AuthContext,
	): Promise<QuizOutcomeResponse>;
}
