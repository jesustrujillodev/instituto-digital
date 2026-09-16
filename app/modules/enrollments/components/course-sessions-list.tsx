import { ExternalLink, MapPin } from "lucide-react";
import { formatSessionRange } from "@/lib/date-utils";
import type { EnrollmentCourseSession } from "../domain/enrollment.types";

export function CourseSessionsList({
	sessions,
}: {
	sessions: readonly EnrollmentCourseSession[];
}) {
	if (sessions.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">Sin sesiones programadas.</p>
		);
	}

	return (
		<ol className="flex flex-col divide-y divide-border">
			{sessions.map((session, index) => (
				<li key={session.documentId} className="flex flex-col gap-1 py-2">
					<p className="font-medium text-sm">
						Sesión {index + 1} ·{" "}
						{formatSessionRange(
							new Date(session.startsAt),
							new Date(session.endsAt),
						)}
					</p>
					{session.venue && (
						<p className="flex items-center gap-1 text-muted-foreground text-xs">
							<MapPin className="h-3 w-3" />
							{session.venue}
						</p>
					)}
					{session.link && (
						<a
							href={session.link}
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-1 text-primary text-xs underline-offset-2 hover:underline"
						>
							<ExternalLink className="h-3 w-3" />
							{session.link}
						</a>
					)}
				</li>
			))}
		</ol>
	);
}
