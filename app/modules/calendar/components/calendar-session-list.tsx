import { CalendarX } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import type { CalendarSession } from "../domain/calendar.types";
import { formatDayLabel } from "../utils/calendar-labels";
import { CalendarSessionChip } from "./calendar-session-chip";

export function CalendarSessionList({
	days,
	sessionsByDay,
	onSelect,
}: {
	/** Solo los días del mes, en orden. */
	days: readonly string[];
	sessionsByDay: ReadonlyMap<string, CalendarSession[]>;
	onSelect: (session: CalendarSession) => void;
}) {
	const withSessions = days.filter((day) => sessionsByDay.has(day));

	if (withSessions.length === 0) {
		return (
			<Empty className="rounded-lg border border-border">
				<EmptyHeader>
					<CalendarX className="mx-auto h-6 w-6 text-muted-foreground" />
					<EmptyTitle>Sin sesiones este mes</EmptyTitle>
					<EmptyDescription>
						No hay sesiones que coincidan con los filtros.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ol className="flex flex-col gap-4">
			{withSessions.map((day) => (
				<li key={day} className="flex flex-col gap-2">
					<h2 className="font-medium text-sm">{formatDayLabel(day)}</h2>
					<div className="flex flex-col gap-1.5">
						{sessionsByDay.get(day)?.map((session) => (
							<CalendarSessionChip
								key={session.documentId}
								session={session}
								onSelect={onSelect}
								showModality
							/>
						))}
					</div>
				</li>
			))}
		</ol>
	);
}
