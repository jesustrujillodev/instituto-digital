import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import type { CalendarSession } from "../domain/calendar.types";
import { formatDayLabel, WEEKDAY_LABELS } from "../utils/calendar-labels";
import { CalendarSessionChip } from "./calendar-session-chip";

const VISIBLE_PER_DAY = 3;

function DayPopover({
	day,
	sessions,
	onSelect,
	trigger,
}: {
	day: string;
	sessions: readonly CalendarSession[];
	onSelect: (session: CalendarSession) => void;
	trigger: React.ReactNode;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent className="w-72 gap-2 p-3">
				<PopoverTitle className="text-sm">{formatDayLabel(day)}</PopoverTitle>
				<div className="flex flex-col gap-1">
					{sessions.map((session) => (
						<CalendarSessionChip
							key={session.documentId}
							session={session}
							onSelect={onSelect}
						/>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function CalendarMonthGrid({
	month,
	days,
	today,
	sessionsByDay,
	onSelect,
}: {
	month: string;
	days: readonly string[];
	today: string;
	sessionsByDay: ReadonlyMap<string, CalendarSession[]>;
	onSelect: (session: CalendarSession) => void;
}) {
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card">
			<div className="grid grid-cols-7 border-border border-b bg-muted/50">
				{WEEKDAY_LABELS.map((label) => (
					<div
						key={label}
						className="px-1 py-2 text-center font-medium text-muted-foreground text-xs"
					>
						{label}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7">
				{days.map((day) => {
					const sessions = sessionsByDay.get(day) ?? [];
					const inMonth = day.startsWith(month);
					const hidden = sessions.length - VISIBLE_PER_DAY;

					return (
						<div
							key={day}
							className={cn(
								"flex min-h-16 min-w-0 flex-col gap-1 border-border border-r border-b p-1 md:min-h-28 [&:nth-child(7n)]:border-r-0",
								!inMonth && "bg-muted/30",
							)}
						>
							<span
								className={cn(
									"flex size-6 items-center justify-center self-end rounded-full text-xs tabular-nums",
									!inMonth && "text-muted-foreground",
									day === today &&
										"bg-primary font-semibold text-primary-foreground",
								)}
							>
								{Number(day.slice(8))}
							</span>

							{sessions.length > 0 && (
								<DayPopover
									day={day}
									sessions={sessions}
									onSelect={onSelect}
									trigger={
										<button
											type="button"
											className="mx-auto flex items-center gap-0.5 rounded-sm px-1 md:hidden"
										>
											<span className="size-1.5 rounded-full bg-primary" />
											<span className="text-[10px] text-muted-foreground tabular-nums">
												{sessions.length}
											</span>
											<span className="sr-only">
												sesiones el {formatDayLabel(day)}
											</span>
										</button>
									}
								/>
							)}

							<div className="hidden flex-col gap-1 md:flex">
								{sessions.slice(0, VISIBLE_PER_DAY).map((session) => (
									<CalendarSessionChip
										key={session.documentId}
										session={session}
										onSelect={onSelect}
									/>
								))}
								{hidden > 0 && (
									<DayPopover
										day={day}
										sessions={sessions}
										onSelect={onSelect}
										trigger={
											<button
												type="button"
												className="rounded-sm px-1.5 text-left text-muted-foreground text-xs hover:underline"
											>
												+{hidden} más
											</button>
										}
									/>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
