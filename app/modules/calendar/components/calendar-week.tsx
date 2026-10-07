import { ArrowRight, CalendarX } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { formatZonedTime, utcToZonedInput } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { CALENDAR_LENSES, type CalendarLens } from "../domain/calendar.config";
import type { CalendarSession, CalendarWeek } from "../domain/calendar.types";
import {
	formatDayLabel,
	LENS_LABELS,
	primaryLensOf,
	WEEKDAY_LABELS,
} from "../utils/calendar-labels";
import { LENS_STYLES } from "./calendar-session-chip";

/** El punto de cada lente en la tira; el hueco es la invitación sin responder. */
export const LENS_DOT_STYLES: Record<CalendarLens, string> = {
	organizing: "bg-primary",
	global: "bg-primary",
	teaching: "bg-chart-2",
	enrolled: "bg-foreground/55",
	invited: "border border-muted-foreground bg-transparent",
	staff: "bg-muted-foreground/50",
};

const dayOf = (session: CalendarSession) =>
	utcToZonedInput(new Date(session.startsAt)).date;

/** «Lun», «Mar»… para un día `YYYY-MM-DD`, sin zona: es un día, no un instante. */
const weekdayOf = (day: string) => {
	const [year, month, date] = day.split("-").map(Number);
	return WEEKDAY_LABELS[
		(new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7
	];
};

const sessionsLabel = (count: number) =>
	count === 0 ? "sin sesiones" : count === 1 ? "1 sesión" : `${count} sesiones`;

function DayButton({
	day,
	sessions,
	isToday,
	selected,
	onSelect,
}: {
	day: string;
	sessions: CalendarSession[];
	isToday: boolean;
	selected: boolean;
	onSelect: () => void;
}) {
	const lenses = CALENDAR_LENSES.filter((lens) =>
		sessions.some((session) => primaryLensOf(session.lenses) === lens),
	);

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			aria-label={`${formatDayLabel(day)}${isToday ? " (hoy)" : ""}, ${sessionsLabel(sessions.length)}`}
			className={cn(
				"flex min-h-16 flex-col items-center justify-between gap-1 rounded-xl px-1 py-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
				selected
					? "bg-background text-foreground shadow-sm"
					: "text-foreground/70 hover:bg-background/60 hover:text-foreground",
			)}
		>
			<span className="text-xs">{weekdayOf(day)}</span>
			<span
				className={cn(
					"flex size-7 items-center justify-center rounded-full font-semibold text-sm tabular-nums",
					isToday && "bg-primary text-primary-foreground",
				)}
			>
				{Number(day.slice(8))}
			</span>
			<span className="flex h-2 items-center gap-0.5" aria-hidden="true">
				{lenses.map((lens) => (
					<span
						key={lens}
						className={cn("size-1.5 rounded-full", LENS_DOT_STYLES[lens])}
					/>
				))}
			</span>
		</button>
	);
}

function AgendaItem({ session }: { session: CalendarSession }) {
	const lens = primaryLensOf(session.lenses);
	const isDraft = session.course.status === "DRAFT";
	const place = session.venue ?? (session.link ? "En línea" : null);
	const title = `${isDraft ? "Borrador · " : ""}${session.course.title}`;

	return (
		<li className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
			<span className="w-24 shrink-0 text-muted-foreground text-xs tabular-nums leading-5">
				{formatZonedTime(new Date(session.startsAt))}–
				{formatZonedTime(new Date(session.endsAt))}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				{session.courseHref ? (
					<Link
						to={session.courseHref}
						className="line-clamp-2 rounded-sm font-medium text-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
					>
						{title}
					</Link>
				) : (
					<p className="line-clamp-2 font-medium text-sm">{title}</p>
				)}
				<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
					<span
						className={cn(
							"rounded-md border px-1.5 py-px font-medium",
							LENS_STYLES[lens],
						)}
					>
						{LENS_LABELS[lens]}
					</span>
					{place && <span className="truncate">{place}</span>}
				</p>
			</div>
		</li>
	);
}

/**
 * Hoy y los seis días siguientes: una tira para ver cómo viene cargada la semana
 * y la agenda del día que se elija. Los colores son los de /dashboard/calendario.
 */
export function CalendarWeekCard({ week }: { week: CalendarWeek }) {
	const [selectedDay, setSelectedDay] = useState(week.today);
	const agendaId = useId();

	const byDay = useMemo(() => {
		const grouped = new Map<string, CalendarSession[]>(
			week.days.map((day) => [day, []]),
		);
		for (const session of week.sessions)
			grouped.get(dayOf(session))?.push(session);
		return grouped;
	}, [week]);

	const selected = byDay.get(selectedDay) ?? [];
	const presentLenses = CALENDAR_LENSES.filter((lens) =>
		week.sessions.some((session) => primaryLensOf(session.lenses) === lens),
	);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<h2 className="font-medium text-base">Esta semana</h2>
				<Link
					to="/dashboard/calendario"
					className="inline-flex items-center gap-1 rounded-md font-medium text-primary text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
				>
					Ver calendario
					<ArrowRight className="size-3.5" aria-hidden="true" />
				</Link>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<fieldset
					aria-controls={agendaId}
					className="grid min-w-0 grid-cols-7 gap-1 rounded-2xl bg-muted p-1"
				>
					<legend className="sr-only">Días de la semana</legend>
					{week.days.map((day) => (
						<DayButton
							key={day}
							day={day}
							sessions={byDay.get(day) ?? []}
							isToday={day === week.today}
							selected={day === selectedDay}
							onSelect={() => setSelectedDay(day)}
						/>
					))}
				</fieldset>

				<div id={agendaId} aria-live="polite" className="flex flex-col gap-3">
					<h3 className="font-medium text-sm">
						{selectedDay === week.today ? "Hoy · " : ""}
						{formatDayLabel(selectedDay)}
					</h3>
					{selected.length === 0 ? (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<CalendarX className="size-4 shrink-0" aria-hidden="true" />
							Sin sesiones este día.
						</p>
					) : (
						<ul className="flex flex-col divide-y">
							{selected.map((session) => (
								<AgendaItem key={session.documentId} session={session} />
							))}
						</ul>
					)}
				</div>

				{(presentLenses.length > 1 || week.truncated) && (
					<div className="flex flex-col gap-2 border-t pt-3">
						{presentLenses.length > 1 && (
							<ul
								aria-label="Qué significa cada color"
								className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs"
							>
								{presentLenses.map((lens) => (
									<li key={lens} className="flex items-center gap-1.5">
										<span
											className={cn(
												"size-2 rounded-full",
												LENS_DOT_STYLES[lens],
											)}
											aria-hidden="true"
										/>
										{LENS_LABELS[lens]}
									</li>
								))}
							</ul>
						)}
						{week.truncated && (
							<p className="text-muted-foreground text-xs">
								Hay más sesiones esta semana de las que caben aquí; el
								calendario las tiene todas.
							</p>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
