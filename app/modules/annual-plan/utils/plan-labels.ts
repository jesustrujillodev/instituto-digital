import type { PlanLineStatus } from "../domain/annual-plan.config";
import type { PlanProgress } from "../domain/annual-plan.types";

export const PLAN_LINE_STATUS_LABELS: Record<PlanLineStatus, string> = {
	PENDING: "Pendiente",
	SCHEDULED: "Programada",
	DONE: "Realizada",
	CANCELLED: "Cancelada",
};

export const MONTH_LABELS: Record<number, string> = {
	1: "Enero",
	2: "Febrero",
	3: "Marzo",
	4: "Abril",
	5: "Mayo",
	6: "Junio",
	7: "Julio",
	8: "Agosto",
	9: "Septiembre",
	10: "Octubre",
	11: "Noviembre",
	12: "Diciembre",
};

/** "3 de 5 realizadas (60 %)", o un aviso si no hay nada que medir. */
export const progressLabel = (progress: PlanProgress): string =>
	progress.ratio === null
		? "Sin líneas vigentes"
		: `${progress.done} de ${progress.total - progress.cancelled} realizadas (${Math.round(progress.ratio * 100)} %)`;
