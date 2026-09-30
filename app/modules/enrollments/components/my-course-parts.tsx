import { BookOpen } from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { ProgressBar } from "@/modules/content/components/progress-bar";
import { requiresSessions } from "@/modules/courses/domain/course.rules";
import { Button } from "@/shared/components/ui/button";
import { isOverForParticipant } from "../domain/enrollment.rules";
import type { MyCourseEntry } from "../domain/enrollment.types";

export const isOverFor = ({ course, outcome }: MyCourseEntry) =>
	isOverForParticipant(course, outcome.completed);

/** Asistencia y nota del curso finalizado. */
export function OutcomeDetail({ entry }: { entry: MyCourseEntry }) {
	const { course, enrollment, outcome } = entry;

	if (!requiresSessions(course.format)) {
		return (
			<p className="text-muted-foreground text-xs">
				{outcome.contentCompletedAt
					? `Terminaste el contenido el ${formatZonedDate(new Date(outcome.contentCompletedAt))}`
					: `Avance del contenido: ${outcome.progressPercent} %`}
				{enrollment.result !== "PENDING" && outcome.grade !== null
					? ` · nota ${outcome.grade}`
					: ""}
			</p>
		);
	}

	return (
		<p className="text-muted-foreground text-xs">
			Asististe a {outcome.attendedSessions} de {course.sessions.length}{" "}
			sesiones
			{enrollment.result !== "PENDING" && outcome.grade !== null
				? ` · nota ${outcome.grade}`
				: ""}
		</p>
	);
}

/** La barra solo donde el contenido cuenta para completar el curso. */
export function ContentProgress({ entry }: { entry: MyCourseEntry }) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-baseline justify-between text-xs">
				<span className="text-muted-foreground">Avance</span>
				<span className="tabular-nums">{entry.outcome.progressPercent} %</span>
			</div>
			<ProgressBar
				value={entry.outcome.progressPercent}
				label={`Avance en ${entry.course.title}`}
			/>
		</div>
	);
}

/** «Continuar» si ya empezó; «Repasar» si para quien lo cursa ya terminó. */
export function ClassroomLink({
	entry,
	size = "sm",
}: {
	entry: MyCourseEntry;
	size?: "sm" | "default";
}) {
	const label = isOverFor(entry)
		? "Repasar"
		: entry.outcome.progressPercent > 0
			? "Continuar"
			: "Entrar al aula";

	return (
		<Button size={size} asChild>
			<Link
				to={`/dashboard/mis-capacitaciones/${entry.course.documentId}/aula`}
			>
				<BookOpen />
				{label}
			</Link>
		</Button>
	);
}
