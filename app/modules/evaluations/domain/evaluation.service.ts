import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	EvaluationBoardResponse,
	EvaluationDefinitionsResponse,
	EvaluationMutationResponse,
	EvaluationSaveResultsResponse,
	SaveEvaluationDto,
	SaveEvaluationResultsDto,
} from "./evaluation.types";

export interface IEvaluationService {
	/** Las evaluaciones del curso con lo capturado, para la ficha de imparticion. */
	findCourseBoard(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<EvaluationBoardResponse>;
	/** Las evaluaciones del curso para definirlas al crearlo o editarlo. */
	findDefinitions(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<EvaluationDefinitionsResponse>;
	create(
		courseDocumentId: string,
		dto: SaveEvaluationDto,
		actor: AuthContext,
	): Promise<EvaluationMutationResponse>;
	update(
		courseDocumentId: string,
		evaluationDocumentId: string,
		dto: SaveEvaluationDto,
		actor: AuthContext,
	): Promise<EvaluationMutationResponse>;
	/** Se lleva por delante sus capturas (cascada en la tabla). */
	remove(
		courseDocumentId: string,
		evaluationDocumentId: string,
		actor: AuthContext,
	): Promise<EvaluationMutationResponse>;
	saveResults(
		courseDocumentId: string,
		dto: SaveEvaluationResultsDto,
		actor: AuthContext,
	): Promise<EvaluationSaveResultsResponse>;
}
