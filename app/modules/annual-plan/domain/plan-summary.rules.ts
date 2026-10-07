import { utcToZonedInput } from "@/lib/date-utils";
import { planLineStatusOf, planProgressOf } from "./annual-plan.rules";
import type {
	DependencyPlanRecord,
	DuePlanLine,
	PlanCoverage,
	StoredPlanLine,
} from "./annual-plan.types";

/** El mes en curso, 1 a 12, en la zona del instituto. */
export const currentPlanMonth = (now: Date): number =>
	Number(utcToZonedInput(now).date.slice(5, 7));

/**
 * Las líneas pendientes cuyo mes ya llegó: siguen sin curso activo y nadie las
 * canceló. Las atrasadas primero, por mes.
 */
export const dueLinesOf = (
	lines: readonly StoredPlanLine[],
	now: Date,
): DuePlanLine[] => {
	const month = currentPlanMonth(now);

	return lines
		.filter(
			(line) =>
				line.plannedMonth <= month && planLineStatusOf(line) === "PENDING",
		)
		.sort((a, b) => a.plannedMonth - b.plannedMonth)
		.map((line) => ({
			documentId: line.documentId,
			title: line.title,
			plannedMonth: line.plannedMonth,
			overdue: line.plannedMonth < month,
		}));
};

/** El avance de cada plan del ejercicio y quién todavía no lo tiene. */
export const toPlanCoverage = (
	fiscalYear: number,
	records: readonly DependencyPlanRecord[],
): PlanCoverage => ({
	fiscalYear,
	plans: records.flatMap((record) =>
		record.plan
			? [
					{
						documentId: record.plan.documentId,
						dependencyName: record.name,
						progress: planProgressOf(record.plan.lines),
					},
				]
			: [],
	),
	withoutPlan: records
		.filter((record) => record.plan === null)
		.map(({ documentId, name }) => ({ documentId, name })),
});
