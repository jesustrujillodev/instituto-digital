import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	GrantRetakeDto,
	ModuleQuizBoardResponse,
	ModuleQuizDto,
	QuizBankResponse,
	QuizMutationResponse,
	QuizOutcomeResponse,
	QuizOwnerRef,
	QuizViewResponse,
	RenameQuizDto,
	SaveQuizDto,
	SubmitQuizDto,
} from "./quiz.types";

/**
 * Los cuestionarios autocalificados (docs/adr/0015, 0016). El dueño decide
 * cuál: sin lección ni módulo, el examen final del curso; con lección, la
 * práctica de esa lección `QUIZ`; con módulo, la evaluación de ese módulo.
 */
export interface IQuizService {
	/** El banco para quien lo arma, con las respuestas correctas. */
	findBank(
		courseDocumentId: string,
		owner: QuizOwnerRef,
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
	/** Deja de contar para el avance; sus intentos se conservan. */
	archiveModuleQuiz(
		courseDocumentId: string,
		dto: ModuleQuizDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;

	/** Para quien lo presenta, sin respuestas correctas. `null` si no hay qué presentar. */
	findView(
		courseDocumentId: string,
		owner: QuizOwnerRef,
		actor: AuthContext,
	): Promise<QuizViewResponse>;
	/** Califica, guarda el intento y aplica su efecto. */
	submit(
		courseDocumentId: string,
		dto: SubmitQuizDto,
		actor: AuthContext,
	): Promise<QuizOutcomeResponse>;

	/** Las evaluaciones de módulo y el último intento de cada quien, para quien imparte. */
	findModuleQuizBoard(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ModuleQuizBoardResponse>;
	/** Habilita otro intento sobre uno reprobado de una evaluación de módulo. */
	grantRetake(
		courseDocumentId: string,
		dto: GrantRetakeDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;
}
