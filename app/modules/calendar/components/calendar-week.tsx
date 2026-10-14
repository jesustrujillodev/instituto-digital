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

const UPCOMING_LIMIT = 4;

const dayOf = (session: CalendarSession) =>
	utcToZonedInput(new Date(session.startsAt)).date;

/** Lunes 0 … domingo 6 para un día `YYYY-MM-DD`, sin zona: es un día, no un instante. */
const weekdayIndexOf = (day: string) => {
	const [year, month, date] = day.split("-").map(Number);
	return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
};

const weekdayOf = (day: string) => WEEKDAY_LABELS[weekdayIndexOf(day)];

const sessionsLabel = (count: number) =>
	count === 0 ? "sin sesiones" : count === 1 ? "1 sesión" : `${count} sesiones`;

const titleOf = (session: CalendarSession) =>
	`${session.course.status === "DRAFT" ? "Borrador · " : ""}${session.course.title}`;

function SessionTitle({
	session,
	className,
}: {
	session: CalendarSession;
	className?: string;
}) {
	if (!session.courseHref)
		return <p className={className}>{titleOf(session)}</p>;

	return (
		<Link
			to={session.courseHref}
			className={cn(
				"rounded-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30",
				className,
			)}
		>
			{titleOf(session)}
		</Link>
	);
}

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
	const weekend = weekdayIndexOf(day) >= 5;

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			aria-label={`${formatDayLabel(day)}${isToday ? " (hoy)" : ""}, ${sessionsLabel(sessions.length)}`}
			className={cn(
				"flex min-h-17 flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/30",
				selected ? "bg-foreground text-background shadow-sm" : "hover:bg-muted",
			)}
		>
			<span className={cn("text-xs", !selected && "text-muted-foreground")}>
				{weekdayOf(day)}
			</span>
			<span
				className={cn(
					"font-semibold text-base tabular-nums leading-none",
					!selected &&
						(isToday ? "text-primary" : weekend && "text-muted-foreground"),
				)}
			>
				{Number(day.slice(8))}
			</span>
			<span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
				{lenses.map((lens) => (
					<span
						key={lens}
						className={cn(
							"size-1.5 rounded-full",
							!selected
								? LENS_DOT_STYLES[lens]
								: lens === "invited"
									? "border border-background"
									: "bg-background",
						)}
					/>
				))}
			</span>
		</button>
	);
}

function AgendaItem({ session }: { session: CalendarSession }) {
	const lens = primaryLensOf(session.lenses);
	const place = session.venue ?? (session.link ? "En línea" : null);

	return (
		<li className="flex gap-3 rounded-xl bg-muted/60 p-3">
			<span className="w-24 shrink-0 text-muted-foreground text-xs tabular-nums leading-5">
				{formatZonedTime(new Date(session.startsAt))}–
				{formatZonedTime(new Date(session.endsAt))}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<SessionTitle
					session={session}
					className="line-clamp-2 font-semibold text-sm"
				/>
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

/** «Mañana · jueves 15» o «Viernes 16». */
const upcomingDayLabel = (day: string, tomorrow: string | undefined) => {
	const weekday = formatDayLabel(day).split(",")[0];
	const date = Number(day.slice(8));
	return day === tomorrow
		? `Mañana · ${weekday.toLowerCase()} ${date}`
		: `${weekday} ${date}`;
};

/** Lo que viene después de hoy en la semana, agrupado por día. */
function UpcomingDays({
	sessions,
	tomorrow,
}: {
	sessions: CalendarSession[];
	tomorrow: string | undefined;
}) {
	const shown = sessions.slice(0, UPCOMING_LIMIT);
	const overflow = sessions.length - shown.length;
	const days = new Map<string, CalendarSession[]>();
	for (const session of shown) {
		const day = dayOf(session);
		days.set(day, [...(days.get(day) ?? []), session]);
	}

	return (
		<div className="flex flex-col gap-4">
			{[...days].map(([day, daySessions]) => (
				<section key={day} className="flex flex-col gap-1">
					<h3 className="mb-1 font-medium text-muted-foreground text-xs">
						{upcomingDayLabel(day, tomorrow)}
					</h3>
					<ul className="flex flex-col">
						{daySessions.map((session) => (
							<li
								key={session.documentId}
								className="flex items-baseline gap-3 px-3 py-1.5"
							>
								<span className="w-21 shrink-0 text-muted-foreground text-xs tabular-nums">
									{formatZonedTime(new Date(session.startsAt))}–
									{formatZonedTime(new Date(session.endsAt))}
								</span>
								<SessionTitle
									session={session}
									className="min-w-0 flex-1 truncate text-sm"
								/>
							</li>
						))}
					</ul>
				</section>
			))}
			{overflow > 0 && (
				<Link
					to="/dashboard/calendario"
					className="self-start rounded-sm px-3 text-muted-foreground text-xs underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
				>
					y {overflow} más →
				</Link>
			)}
		</div>
	);
}

/**
 * Hoy y los seis días siguientes: una tira para ver cómo viene cargada la
 * semana, la agenda del día que se elija y, si es hoy, lo que sigue en los
 * próximos días. Los colores son los de /dashboard/calendario.
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
	const isTodaySelected = selectedDay === week.today;
	const upcoming = isTodaySelected
		? week.sessions.filter((session) => dayOf(session) > week.today)
		: [];
	const presentLenses = CALENDAR_LENSES.filter((lens) =>
		week.sessions.some((session) => primaryLensOf(session.lenses) === lens),
	);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<h2 className="font-semibold text-lg">Esta semana</h2>
				<Link
					to="/dashboard/calendario"
					className="inline-flex items-center gap-1 rounded-md font-medium text-primary text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
				>
					Ver calendario
					<ArrowRight className="size-3.5" aria-hidden="true" />
				</Link>
			</CardHeader>
			<CardContent className="flex flex-col gap-5">
				<fieldset
					aria-controls={agendaId}
					className="grid min-w-0 grid-cols-7 gap-1"
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

				<div id={agendaId} aria-live="polite" className="flex flex-col gap-5">
					<div className="flex flex-col gap-2">
						<h3 className="font-medium text-muted-foreground text-xs">
							{isTodaySelected ? "Hoy" : formatDayLabel(selectedDay)}
						</h3>
						{selected.length === 0 ? (
							<p className="flex items-center gap-2 text-muted-foreground text-sm">
								<CalendarX className="size-4 shrink-0" aria-hidden="true" />
								{isTodaySelected
									? "Sin sesiones hoy."
									: "Sin sesiones este día."}
							</p>
						) : (
							<ul className="flex flex-col gap-2">
								{selected.map((session) => (
									<AgendaItem key={session.documentId} session={session} />
								))}
							</ul>
						)}
					</div>

					{upcoming.length > 0 && (
						<UpcomingDays sessions={upcoming} tomorrow={week.days[1]} />
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
