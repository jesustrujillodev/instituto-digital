import { formatZonedTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { MODALITY_LABELS } from "@/modules/courses/utils/course-labels";
import type { CalendarLens } from "../domain/calendar.config";
import type { CalendarSession } from "../domain/calendar.types";
import { primaryLensOf } from "../utils/calendar-labels";

export const LENS_STYLES: Record<CalendarLens, string> = {
	organizing: "border-primary/40 bg-primary/10 text-foreground",
	global: "border-primary/40 bg-primary/10 text-foreground",
	teaching: "border-chart-2/50 bg-chart-2/15 text-foreground",
	enrolled: "border-border bg-secondary text-secondary-foreground",
	invited:
		"border-dashed border-muted-foreground/60 bg-background text-muted-foreground",
	staff: "border-border bg-muted text-muted-foreground",
};

export function CalendarSessionChip({
	session,
	onSelect,
	showModality = false,
}: {
	session: CalendarSession;
	onSelect: (session: CalendarSession) => void;
	showModality?: boolean;
}) {
	const isDraft = session.course.status === "DRAFT";

	return (
		<button
			type="button"
			onClick={() => onSelect(session)}
			className={cn(
				"flex w-full min-w-0 items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-left text-xs transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				LENS_STYLES[primaryLensOf(session.lenses)],
				isDraft && "opacity-70",
			)}
		>
			<span className="shrink-0 tabular-nums">
				{formatZonedTime(new Date(session.startsAt))}
			</span>
			<span className="truncate font-medium">
				{isDraft && "Borrador · "}
				{session.course.title}
			</span>
			{showModality && (
				<span className="ml-auto shrink-0 text-muted-foreground">
					{MODALITY_LABELS[session.course.modality]}
				</span>
			)}
		</button>
	);
}
