import type { CourseScopeWhere } from "@/modules/courses/domain/course.access";
import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type { EvaluationRaw } from "./evaluation.mapper";
import type {
	EvaluationCourse,
	EvaluationResultWrite,
	EvaluationTarget,
	EvaluationWrite,
} from "./evaluation.types";

/** Impartición para capturar; administración de cursos para definir. */
export type EvaluationCourseWhere = TeachingCourseWhere | CourseScopeWhere;

export interface IEvaluationRepository {
	/** El curso si el alcance lo alcanza; `null` si no. */
	findCourse(
		courseDocumentId: string,
		where: EvaluationCourseWhere,
	): Promise<EvaluationCourse | null>;
	findBoard(courseId: number): Promise<EvaluationRaw[]>;
	/** `null` si la evaluacion no existe o no es de ese curso. */
	findTarget(
		courseDocumentId: string,
		evaluationDocumentId: string,
		where: EvaluationCourseWhere,
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
