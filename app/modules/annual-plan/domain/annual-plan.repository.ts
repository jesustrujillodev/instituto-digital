import type { PlanScopeWhere } from "./annual-plan.access";
import type {
	LockedPlanLine,
	PlanLineDto,
	PlanWriteData,
	StoredLineWithPlan,
	StoredPlan,
} from "./annual-plan.types";

export interface IAnnualPlanRepository {
	/** Del ejercicio más reciente al más antiguo, con sus líneas para el avance. */
	findPlans(
		where: PlanScopeWhere,
		filters: { dependencyDocumentId?: string; fiscalYear?: number },
	): Promise<StoredPlan[]>;
	findPlan(
		documentId: string,
		where: PlanScopeWhere,
	): Promise<StoredPlan | null>;
	/** Lanza `AnnualPlanAlreadyExistsError` si la dependencia ya tiene ese ejercicio. */
	createPlan(data: PlanWriteData): Promise<{ documentId: string }>;

	/** La línea si su plan cumple el filtro; si no, `null`. */
	findLine(
		documentId: string,
		where: PlanScopeWhere,
	): Promise<StoredLineWithPlan | null>;
	createLine(
		planId: number,
		data: PlanLineDto,
		createdById: number,
	): Promise<void>;
	updateLine(lineId: number, data: PlanLineDto): Promise<void>;
	setLineCancelled(
		lineId: number,
		cancellation: { at: Date; actorId: number } | null,
	): Promise<void>;
	/** Lanza `AnnualPlanLineHasCoursesError` si un curso la referencia. */
	deleteLine(lineId: number): Promise<void>;

	/**
	 * Bloquea la fila de la línea hasta el final de la transacción y la relee.
	 * Serializa dos "Crear curso" sobre la misma línea. Solo tiene sentido dentro
	 * de `runInTransaction`.
	 */
	lockLineForCourse(documentId: string): Promise<LockedPlanLine | null>;
}
