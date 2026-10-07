import type * as v from "valibot";
import type {
	CourseFormat,
	CourseModality,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { AppResponse } from "@/shared/response/response.types";
import type { PlanLineStatus } from "./annual-plan.config";
import type {
	createPlanRule,
	listPlansRule,
	planLineRule,
} from "./annual-plan.rules";

export type CreatePlanDto = v.InferOutput<typeof createPlanRule>;
export type PlanLineDto = v.InferOutput<typeof planLineRule>;
export type ListPlansDto = v.InferOutput<typeof listPlansRule>;

// ── Lo que el repositorio lee ─────────────────────────────────────────────────

export interface LinkedCourse {
	documentId: string;
	title: string;
	status: CourseStatus;
	format: CourseFormat;
}

export interface StoredPlanLine {
	id: number;
	documentId: string;
	title: string;
	plannedMonth: number;
	plannedModality: CourseModality | null;
	estimatedDuration: string | null;
	targetAudience: string | null;
	notes: string | null;
	cancelledAt: Date | null;
	/** Todos los que tuvo, incluidos los cancelados; el más reciente primero. */
	courses: LinkedCourse[];
}

export interface PlanRef {
	id: number;
	documentId: string;
	dependencyId: number;
	dependencyName: string;
	fiscalYear: number;
}

export interface StoredPlan extends PlanRef {
	lines: StoredPlanLine[];
}

export interface StoredLineWithPlan extends StoredPlanLine {
	plan: PlanRef;
}

/** Lo que `courses` necesita de la línea, leído con su fila bloqueada. */
export interface LockedPlanLine {
	id: number;
	cancelledAt: Date | null;
	plan: { dependencyId: number; fiscalYear: number };
	courses: { status: CourseStatus }[];
}

export interface PlanWriteData {
	dependencyId: number;
	fiscalYear: number;
	createdById: number;
}

// ── Lo que ve la pantalla ─────────────────────────────────────────────────────

export interface PlanProgress {
	done: number;
	total: number;
	cancelled: number;
	/** `done / (total − cancelled)`; `null` si no hay nada que medir. */
	ratio: number | null;
}

export interface PlanSummary {
	documentId: string;
	dependencyName: string;
	fiscalYear: number;
	progress: PlanProgress;
	readOnly: boolean;
}

export interface PlanList {
	plans: PlanSummary[];
	canManage: boolean;
	/** Ejercicios que el titular o un auxiliar todavía pueden crear. */
	creatableYears: number[];
}

export interface PlanLineView {
	documentId: string;
	title: string;
	plannedMonth: number;
	plannedModality: CourseModality | null;
	estimatedDuration: string | null;
	targetAudience: string | null;
	notes: string | null;
	status: PlanLineStatus;
	activeCourse: LinkedCourse | null;
	cancelledCourses: number;
	can: {
		edit: boolean;
		cancel: boolean;
		reactivate: boolean;
		delete: boolean;
		createCourse: boolean;
	};
}

export interface PlanDetail {
	plan: Omit<PlanRef, "id" | "dependencyId">;
	lines: PlanLineView[];
	months: { month: number; lines: PlanLineView[] }[];
	progress: PlanProgress;
	readOnly: boolean;
	canManage: boolean;
}

/** El prellenado del formulario de curso (§6.11). */
export interface LineForCourse {
	lineDocumentId: string;
	title: string;
	plannedModality: CourseModality | null;
	planDocumentId: string;
	fiscalYear: number;
}

export type PlanListResponse = AppResponse<PlanList>;
export type PlanDetailResponse = AppResponse<PlanDetail>;
export type PlanCreatedResponse = AppResponse<{ documentId: string }>;
export type PlanMutationResponse = AppResponse<null>;
export type LineForCourseResponse = AppResponse<LineForCourse>;

/** Una línea que ya debería tener curso: la de este mes o una atrasada. */
export interface DuePlanLine {
	documentId: string;
	title: string;
	plannedMonth: number;
	overdue: boolean;
}

/** El plan del ejercicio en curso de la dependencia, tal como lo pinta el panel. */
export interface CurrentPlanSummary {
	fiscalYear: number;
	plan: { documentId: string; progress: PlanProgress } | null;
	dueLines: DuePlanLine[];
	dueTotal: number;
}

/** Una dependencia activa con su plan del ejercicio, si lo tiene. */
export interface DependencyPlanRecord {
	documentId: string;
	name: string;
	plan: {
		documentId: string;
		lines: {
			cancelledAt: Date | null;
			courses: { status: CourseStatus; format: CourseFormat }[];
		}[];
	} | null;
}

export interface PlanCoverage {
	fiscalYear: number;
	plans: {
		documentId: string;
		dependencyName: string;
		progress: PlanProgress;
	}[];
	withoutPlan: { documentId: string; name: string }[];
}
