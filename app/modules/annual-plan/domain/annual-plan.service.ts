import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	CreatePlanDto,
	CurrentPlanSummary,
	LineForCourseResponse,
	ListPlansDto,
	PlanCoverage,
	PlanCreatedResponse,
	PlanDetailResponse,
	PlanLineDto,
	PlanListResponse,
	PlanMutationResponse,
} from "./annual-plan.types";

/**
 * Plan anual de cada dependencia (§6.11). Lo consulta el alcance global y lo
 * escriben el titular y los auxiliares; los ejercicios pasados son de solo
 * lectura.
 */
export interface IAnnualPlanService {
	listPlans(query: ListPlansDto, actor: AuthContext): Promise<PlanListResponse>;
	/**
	 * El plan del ejercicio en curso de la dependencia y las líneas que ya
	 * deberían tener curso. Falla con `ANNUAL_PLAN_FORBIDDEN_SCOPE` fuera del
	 * alcance de dependencia.
	 */
	summarizeCurrent(
		actor: AuthContext,
		options: { limit: number },
	): Promise<AppResponse<CurrentPlanSummary>>;
	/**
	 * El avance del ejercicio en curso de cada dependencia activa. Solo el
	 * alcance global; si no, `ANNUAL_PLAN_FORBIDDEN_SCOPE`.
	 */
	summarizeCoverage(actor: AuthContext): Promise<AppResponse<PlanCoverage>>;
	findPlan(documentId: string, actor: AuthContext): Promise<PlanDetailResponse>;
	createPlan(
		dto: CreatePlanDto,
		actor: AuthContext,
	): Promise<PlanCreatedResponse>;

	addLine(
		planDocumentId: string,
		dto: PlanLineDto,
		actor: AuthContext,
	): Promise<PlanMutationResponse>;
	updateLine(
		lineDocumentId: string,
		dto: PlanLineDto,
		actor: AuthContext,
	): Promise<PlanMutationResponse>;
	cancelLine(
		lineDocumentId: string,
		actor: AuthContext,
	): Promise<PlanMutationResponse>;
	reactivateLine(
		lineDocumentId: string,
		actor: AuthContext,
	): Promise<PlanMutationResponse>;
	deleteLine(
		lineDocumentId: string,
		actor: AuthContext,
	): Promise<PlanMutationResponse>;

	/** Título y modalidad para precargar el alta de un curso desde la línea. */
	findLineForCourse(
		lineDocumentId: string,
		actor: AuthContext,
	): Promise<LineForCourseResponse>;
}
