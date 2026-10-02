import { CircleAlert, ExternalLink, MapPin } from "lucide-react";
import {
	formatZonedTime,
	INSTITUTE_TIME_ZONE_LABEL,
	zonedDayLabelOf,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import {
	type CourseModality,
	isSessionPlaced,
	type SessionPhase,
	sessionPhasesOf,
} from "../domain/course.rules";

const MISSING_PLACE: Record<CourseModality, string> = {
	IN_PERSON: "Falta la sede",
	ONLINE: "Falta el enlace",
	HYBRID: "Falta la sede o el enlace",
};

const PHASE_BADGES: Partial<Record<SessionPhase, string>> = {
	current: "En curso",
	next: "Próxima",
};

/** La nota del encabezado del Programa, igual en todas las fichas. */
export const programAsideOf = (count: number): string | null =>
	count === 0
		? null
		: `${count} ${count === 1 ? "sesión" : "sesiones"} · Horario de Tijuana`;

/** Lo que el Programa necesita de una sesión: lo comparten el curso y la inscripción. */
export interface ProgramSession {
	documentId: string;
	startsAt: Date | string;
	endsAt: Date | string;
	venue: string | null;
	link: string | null;
}

interface CourseProgramProps<T extends ProgramSession> {
	sessions: readonly T[];
	modality: CourseModality;
	/** Con él se señala la sesión en curso o la próxima y se apagan las pasadas. */
	now?: Date | string;
	/** Lo que cuelga de cada sesión, como su material. */
	renderSessionExtra?: (session: T) => React.ReactNode;
	emptyMessage?: string;
}

/** El programa del curso tal como se va a vivir: una sesión por renglón. */
export function CourseProgram<T extends ProgramSession>({
	sessions,
	modality,
	now,
	renderSessionExtra,
	emptyMessage = "Todavía no hay sesiones. Hace falta al menos una para publicar.",
}: CourseProgramProps<T>) {
	if (sessions.length === 0) {
		return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
	}

	const phases = now
		? sessionPhasesOf(
				sessions.map((session) => ({
					documentId: session.documentId,
					startsAt: new Date(session.startsAt),
					endsAt: new Date(session.endsAt),
				})),
				new Date(now),
			)
		: null;

	return (
		<>
			<ol className="flex flex-col">
				{sessions.map((session, index) => {
					const startsAt = new Date(session.startsAt);
					const endsAt = new Date(session.endsAt);
					const day = zonedDayLabelOf(startsAt);
					const placed = isSessionPlaced(modality, session);
					const phase = phases?.get(session.documentId);
					const past = phase === "past";
					const pointed = phase === "current" || phase === "next";

					return (
						<li
							key={session.documentId}
							aria-current={phase === "current" ? "step" : undefined}
							className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-4 border-border border-t py-4 first:border-t-0 first:pt-0 last:pb-0"
						>
							<div
								className={cn(
									"flex flex-col items-center rounded-2xl py-2 leading-none",
									pointed ? "bg-primary text-primary-foreground" : "bg-muted",
									past && "opacity-60",
								)}
							>
								<span
									className={cn(
										"text-xs",
										pointed
											? "text-primary-foreground/80"
											: "text-muted-foreground",
									)}
								>
									{day.weekday}
								</span>
								<span className="py-1 font-bold text-xl tabular-nums">
									{day.day}
								</span>
								<span
									className={cn(
										"text-xs",
										pointed
											? "text-primary-foreground/80"
											: "text-muted-foreground",
									)}
								>
									{day.month}
								</span>
							</div>

							<div className="flex min-w-0 flex-col gap-1.5">
								<p
									className={cn(
										"flex flex-wrap items-center gap-x-2 gap-y-1 text-sm",
										past && "text-muted-foreground",
									)}
								>
									<span>
										<span className="font-medium tabular-nums">
											{formatZonedTime(startsAt)}–{formatZonedTime(endsAt)}
										</span>
										<span className="text-muted-foreground">
											{" "}
											· Sesión {index + 1}
										</span>
										{past && <span className="sr-only"> (concluida)</span>}
									</span>
									{phase && PHASE_BADGES[phase] && (
										<Badge>{PHASE_BADGES[phase]}</Badge>
									)}
								</p>

								{session.venue && (
									<p
										className={cn(
											"flex items-start gap-1.5 text-sm",
											past && "text-muted-foreground",
										)}
									>
										<MapPin
											className="mt-0.5 size-4 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span className="sr-only">Sede:</span>
										{session.venue}
									</p>
								)}
								{session.link && (
									<a
										href={session.link}
										target="_blank"
										rel="noreferrer"
										className="flex min-w-0 items-start gap-1.5 text-primary text-sm underline-offset-4 hover:underline"
									>
										<ExternalLink
											className="mt-0.5 size-4 shrink-0"
											aria-hidden="true"
										/>
										<span className="truncate">{session.link}</span>
									</a>
								)}
								{!placed && (
									<p className="flex items-start gap-1.5 text-muted-foreground text-sm">
										<CircleAlert
											className="mt-0.5 size-4 shrink-0 text-destructive"
											aria-hidden="true"
										/>
										{MISSING_PLACE[modality]}
									</p>
								)}

								{renderSessionExtra?.(session)}
							</div>
						</li>
					);
				})}
			</ol>

			<p className="pt-3 text-muted-foreground text-xs">
				Horarios en {INSTITUTE_TIME_ZONE_LABEL}.
			</p>
		</>
	);
}
