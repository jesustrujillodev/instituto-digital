import { ArrowRight, CircleCheck, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import type { CurrentPlanSummary } from "@/modules/annual-plan/domain/annual-plan.types";
import { MONTH_LABELS } from "@/modules/annual-plan/utils/plan-labels";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { MoreLink } from "./dashboard-section";

/**
 * El plan del ejercicio de la dependencia, de un vistazo: cuánto lleva
 * realizado y si lo planeado hasta este mes ya tiene capacitación. Las líneas
 * atrasadas se trabajan en «Requiere tu atención».
 */
export function PlanCard({
	summary,
	today,
}: {
	summary: CurrentPlanSummary;
	today: string;
}) {
	const { plan, dueLines, dueTotal, fiscalYear } = summary;
	const month = MONTH_LABELS[Number(today.slice(5, 7))].toLowerCase();

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<h2 className="font-semibold text-lg">Plan anual {fiscalYear}</h2>
				{plan && (
					<MoreLink
						label="Ver plan"
						to={`/dashboard/plan-anual/${plan.documentId}`}
					/>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{!plan ? (
					<>
						<p className="text-muted-foreground text-sm">
							Tu dependencia aún no tiene plan para {fiscalYear}. Sin él, los
							cursos no se pueden ligar a lo que se planeó.
						</p>
						<Button asChild size="sm" className="self-start">
							<Link to="/dashboard/plan-anual">
								Crear el plan
								<ArrowRight data-icon="inline-end" aria-hidden="true" />
							</Link>
						</Button>
					</>
				) : (
					<PlanProgress
						summary={{ ...summary, plan }}
						month={month}
						hasDue={dueTotal > 0}
						overdue={dueLines.some((line) => line.overdue)}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function PlanProgress({
	summary,
	month,
	hasDue,
	overdue,
}: {
	summary: CurrentPlanSummary & {
		plan: NonNullable<CurrentPlanSummary["plan"]>;
	};
	month: string;
	hasDue: boolean;
	overdue: boolean;
}) {
	const { done, total, cancelled, ratio } = summary.plan.progress;
	const active = total - cancelled;
	const percent = Math.round((ratio ?? 0) * 100);
	const complete = active > 0 && done >= active;

	return (
		<>
			{ratio === null ? (
				<p className="text-muted-foreground text-sm">
					El plan aún no tiene capacitaciones vigentes.
				</p>
			) : (
				<div className="flex flex-col gap-3">
					<p className="flex items-baseline gap-3">
						<span className="font-bold text-3xl text-foreground tabular-nums tracking-tight">
							{percent} %
						</span>
						<span className="text-muted-foreground text-sm tabular-nums">
							{done} de {active} {active === 1 ? "realizada" : "realizadas"}
						</span>
					</p>
					<div
						className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
						role="progressbar"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={percent}
						aria-label={`Avance del plan anual ${summary.fiscalYear}`}
					>
						<div
							className={
								complete
									? "h-full rounded-full bg-success-foreground"
									: "h-full rounded-full bg-foreground/70"
							}
							style={{ width: `${percent}%` }}
						/>
					</div>
				</div>
			)}
			{hasDue ? (
				<p
					className={
						overdue
							? "flex items-start gap-2 font-medium text-warning-foreground text-xs"
							: "flex items-start gap-2 text-muted-foreground text-xs"
					}
				>
					<TriangleAlert
						className="mt-px size-3.5 shrink-0"
						aria-hidden="true"
					/>
					{summary.dueTotal === 1
						? `1 línea planeada hasta ${month} aún no tiene capacitación.`
						: `${summary.dueTotal} líneas planeadas hasta ${month} aún no tienen capacitación.`}
				</p>
			) : (
				<p className="flex items-start gap-2 text-success-foreground text-xs">
					<CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
					Todo lo planeado hasta {month} ya tiene capacitación.
				</p>
			)}
		</>
	);
}
