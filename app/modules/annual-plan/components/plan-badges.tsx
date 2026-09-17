import { Badge } from "@/shared/components/ui/badge";
import type { PlanLineStatus } from "../domain/annual-plan.config";
import type { PlanProgress } from "../domain/annual-plan.types";
import { PLAN_LINE_STATUS_LABELS, progressLabel } from "../utils/plan-labels";

const STATUS_VARIANTS = {
	PENDING: "outline",
	SCHEDULED: "secondary",
	DONE: "default",
	CANCELLED: "outline",
} as const satisfies Record<PlanLineStatus, string>;

export function PlanLineStatusBadge({ status }: { status: PlanLineStatus }) {
	return (
		<Badge
			variant={STATUS_VARIANTS[status]}
			className={status === "CANCELLED" ? "line-through" : undefined}
		>
			{PLAN_LINE_STATUS_LABELS[status]}
		</Badge>
	);
}

export function PlanProgressBar({ progress }: { progress: PlanProgress }) {
	const percent = Math.round((progress.ratio ?? 0) * 100);

	return (
		<div className="flex flex-col gap-1">
			<div
				className="h-2 w-full overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={percent}
				aria-label="Avance del plan"
			>
				<div className="h-full bg-primary" style={{ width: `${percent}%` }} />
			</div>
			<span className="text-muted-foreground text-xs">
				{progressLabel(progress)}
			</span>
		</div>
	);
}
