import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	FollowUpBoardResponse,
	FollowUpDto,
	FollowUpListResponse,
	FollowUpSavedResponse,
	GrantRetakeDto,
	ModuleQuizDto,
	ParticipantFollowUpsResponse,
	QuizBankResponse,
	QuizBoardResponse,
	QuizMutationResponse,
	QuizOutcomeResponse,
	QuizOwnerRef,
	QuizViewResponse,
	RenameQuizDto,
	SaveFollowUpDto,
	SaveFollowUpQuestionsDto,
	SaveQuizDto,
	SubmitQuizDto,
} from "./quiz.types";

/**
 * Los cuestionarios autocalificados (docs/adr/0015, 0016, 0027). El dueño
 * decide cuál: sin ninguno, el examen final del curso; con lección, la
 * práctica de esa lección `QUIZ`; con módulo, la evaluación de ese módulo; con
 * seguimiento, esa evaluación de una sesión.
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

	/** Los cuestionarios del curso y el último intento de cada quien, para quien imparte. */
	findQuizBoard(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<QuizBoardResponse>;
	/** Habilita otro intento a quien reprobó el último y agotó los suyos. */
	grantRetake(
		courseDocumentId: string,
		dto: GrantRetakeDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;

	/** Las evaluaciones de seguimiento, para quien las define. */
	findFollowUps(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<FollowUpListResponse>;
	/**
	 * Crea o cambia la configuración de una evaluación de seguimiento, sin sus
	 * preguntas. Con intentos, solo cambian el nombre y la ventana.
	 */
	saveFollowUp(
		courseDocumentId: string,
		dto: SaveFollowUpDto,
		actor: AuthContext,
	): Promise<FollowUpSavedResponse>;
	/** Reescribe sus preguntas. Solo mientras nadie la haya presentado. */
	saveFollowUpQuestions(
		courseDocumentId: string,
		dto: SaveFollowUpQuestionsDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;
	/** Solo mientras nadie la haya presentado. */
	removeFollowUp(
		courseDocumentId: string,
		dto: FollowUpDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;
	/** Quien imparte abre a mano la que está en modo manual. */
	openFollowUp(
		courseDocumentId: string,
		dto: FollowUpDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;
	/** Cerrar es definitivo y recalcula la nota con los ceros. */
	closeFollowUp(
		courseDocumentId: string,
		dto: FollowUpDto,
		actor: AuthContext,
	): Promise<QuizMutationResponse>;
	/** Las evaluaciones de seguimiento y la mejor nota de cada quien, para quien imparte. */
	findFollowUpBoard(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<FollowUpBoardResponse>;
	/**
	 * Las del participante, con lo que puede hacer con cada una; con sesión,
	 * solo las de esa. Sin inscripción vigente, ninguna.
	 */
	findParticipantFollowUps(
		courseDocumentId: string,
		actor: AuthContext,
		sessionDocumentId?: string,
	): Promise<ParticipantFollowUpsResponse>;
}
