import type * as v from "valibot";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	createEvaluationRule,
	saveEvaluationResultsRule,
} from "./evaluation.rules";

export type SaveEvaluationDto = v.InferOutput<typeof createEvaluationRule>;
export type SaveEvaluationResultsDto = v.InferOutput<
	typeof saveEvaluationResultsRule
>;

/** Lo capturado de una persona. Sin fila es "sin capturar". */
export interface EvaluationCapture {
	/** `null` mientras solo hay observacion. */
	passed: boolean | null;
	note: string | null;
}

export interface EvaluationView {
	documentId: string;
	title: string;
	sessionDocumentId: string | null;
	/** Por `userDocumentId`; si falta la clave, esa persona no tiene nada. */
	captures: Record<string, EvaluationCapture>;
	/** Cuantas personas ya tienen veredicto. */
	recorded: number;
}

export interface EvaluationBoard {
	canWrite: boolean;
	evaluations: EvaluationView[];
}

/** El curso visto desde este modulo: lo justo para autorizar. */
export interface EvaluationCourseRef {
	id: number;
	status: CourseStatus;
	dependencyId: number;
}

export interface EvaluationCourse extends EvaluationCourseRef {
	evaluationCount: number;
}

/** La evaluacion con lo que hace falta para resolver un envio de capturas. */
export interface EvaluationTarget {
	id: number;
	course: EvaluationCourseRef;
	participants: { userId: number; userDocumentId: string }[];
	results: { userId: number; passed: boolean | null; note: string | null }[];
}

export interface EvaluationResultWrite {
	userId: number;
	passed: boolean | null;
	note: string | null;
}

export interface EvaluationWrite {
	courseId: number;
	sessionId: number | null;
	title: string;
	createdById: number;
}

export type EvaluationBoardResponse = AppResponse<EvaluationBoard>;
export type EvaluationDefinitionsResponse = AppResponse<EvaluationView[]>;
export type EvaluationMutationResponse = AppResponse<null>;
export type EvaluationSaveResultsResponse = AppResponse<{ affected: number }>;
