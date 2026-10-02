import { Badge } from "@/shared/components/ui/badge";
import type { CourseTrainerEntry } from "../domain/course.types";

/** Lo mínimo para nombrar a quien imparte; lo demás solo lo trae la administración. */
type TrainerLike = Pick<
	CourseTrainerEntry,
	"firstName" | "lastName" | "email"
> &
	Partial<Pick<CourseTrainerEntry, "specialty" | "isActive">>;

export const trainerNameOf = (trainer: TrainerLike) =>
	[trainer.firstName, trainer.lastName].filter(Boolean).join(" ") ||
	trainer.email;

/**
 * Quién imparte. Un capacitador inactivo se nombra: no cuenta para publicar.
 * Sin `showContact`, solo el nombre: es lo que ve el participante.
 */
export function CourseTrainers({
	trainers,
	showContact = false,
}: {
	trainers: readonly TrainerLike[];
	showContact?: boolean;
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
				<li key={trainer.email} className="flex flex-col gap-0.5">
					<p className="flex flex-wrap items-center gap-2 font-medium text-sm">
						{trainerNameOf(trainer)}
						{showContact && trainer.isActive === false && (
							<Badge variant="destructive">Inactivo</Badge>
						)}
					</p>
					{showContact && (
						<p className="text-muted-foreground text-sm">
							{[trainer.specialty, trainer.email].filter(Boolean).join(" · ")}
						</p>
					)}
				</li>
			))}
		</ul>
	);
}
