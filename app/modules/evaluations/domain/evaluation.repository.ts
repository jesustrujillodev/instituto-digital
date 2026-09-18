import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type { EvaluationRaw } from "./evaluation.mapper";
import type {
	EvaluationCourse,
	EvaluationResultWrite,
	EvaluationTarget,
	EvaluationWrite,
} from "./evaluation.types";

export interface IEvaluationRepository {
	/** El curso si el alcance lo imparte u organiza; `null` si no. */
	findCourse(
		courseDocumentId: string,
		where: TeachingCourseWhere,
	): Promise<EvaluationCourse | null>;
	findBoard(courseId: number): Promise<EvaluationRaw[]>;
	/** `null` si la evaluacion no existe o no es de ese curso. */
	findTarget(
		courseDocumentId: string,
		evaluationDocumentId: string,
		where: TeachingCourseWhere,
	): Promise<EvaluationTarget | null>;
	/** El id interno de la sesion si pertenece al curso. */
	findSessionId(
		courseId: number,
		sessionDocumentId: string,
	): Promise<number | null>;

	create(data: EvaluationWrite): Promise<void>;
	update(
		evaluationId: number,
		data: { title: string; sessionId: number | null },
	): Promise<void>;
	remove(evaluationId: number): Promise<void>;
	/** Capturas que cambian y bajas de las que se vaciaron, en una transaccion. */
	saveResults(
		evaluationId: number,
		writes: readonly EvaluationResultWrite[],
		deletes: readonly number[],
		actorId: number,
		at: Date,
	): Promise<void>;
}
