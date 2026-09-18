import { Badge } from "@/shared/components/ui/badge";
import type { CourseTrainerEntry } from "../domain/course.types";

export const trainerNameOf = (trainer: CourseTrainerEntry) =>
	[trainer.firstName, trainer.lastName].filter(Boolean).join(" ") ||
	trainer.email;

/** Quién imparte. Un capacitador inactivo se nombra: no cuenta para publicar. */
export function CourseTrainers({
	trainers,
}: {
	trainers: readonly CourseTrainerEntry[];
}) {
	if (trainers.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Sin capacitadores asignados.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-3">
			{trainers.map((trainer) => (
				<li key={trainer.userDocumentId} className="flex flex-col gap-0.5">
					<p className="flex flex-wrap items-center gap-2 font-medium text-sm">
						{trainerNameOf(trainer)}
						{!trainer.isActive && <Badge variant="destructive">Inactivo</Badge>}
					</p>
					<p className="text-muted-foreground text-sm">
						{[trainer.specialty, trainer.email].filter(Boolean).join(" · ")}
					</p>
				</li>
			))}
		</ul>
	);
}
