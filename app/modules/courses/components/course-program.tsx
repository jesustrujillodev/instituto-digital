import { CircleAlert, ExternalLink, MapPin } from "lucide-react";
import { formatZonedTime, zonedDayLabelOf } from "@/lib/date-utils";
import {
	type CourseModality,
	requiresLink,
	requiresVenue,
} from "../domain/course.rules";
import type { CourseSession } from "../domain/course.types";

interface CourseProgramProps {
	sessions: readonly CourseSession[];
	modality: CourseModality;
}

/** El programa del curso tal como se va a vivir: una sesión por renglón. */
export function CourseProgram({ sessions, modality }: CourseProgramProps) {
	if (sessions.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Todavía no hay sesiones. Hace falta al menos una para publicar.
			</p>
		);
	}

	return (
		<ol className="flex flex-col">
			{sessions.map((session, index) => {
				const startsAt = new Date(session.startsAt);
				const endsAt = new Date(session.endsAt);
				const day = zonedDayLabelOf(startsAt);
				const missingVenue = requiresVenue(modality) && !session.venue;
				const missingLink = requiresLink(modality) && !session.link;

				return (
					<li
						key={session.documentId}
						className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-4 border-border border-t py-4 first:border-t-0 first:pt-0 last:pb-0"
					>
						<div className="flex flex-col items-center rounded-2xl bg-muted py-2 leading-none">
							<span className="text-muted-foreground text-xs">
								{day.weekday}
							</span>
							<span className="py-1 font-bold text-xl tabular-nums">
								{day.day}
							</span>
							<span className="text-muted-foreground text-xs">{day.month}</span>
						</div>

						<div className="flex min-w-0 flex-col gap-1.5">
							<p className="text-sm">
								<span className="font-medium tabular-nums">
									{formatZonedTime(startsAt)}–{formatZonedTime(endsAt)}
								</span>
								<span className="text-muted-foreground">
									{" "}
									· Sesión {index + 1}
								</span>
							</p>

							{session.venue && (
								<p className="flex items-start gap-1.5 text-sm">
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
							{(missingVenue || missingLink) && (
								<p className="flex items-start gap-1.5 text-muted-foreground text-sm">
									<CircleAlert
										className="mt-0.5 size-4 shrink-0 text-destructive"
										aria-hidden="true"
									/>
									{missingVenue && missingLink
										? "Falta la sede y el enlace"
										: missingVenue
											? "Falta la sede"
											: "Falta el enlace"}
								</p>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
