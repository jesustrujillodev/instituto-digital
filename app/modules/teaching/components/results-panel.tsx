import { personNameOf } from "@/modules/enrollments/utils/enrollment-labels";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { TeachingDetail } from "../domain/teaching.types";

/**
 * La nota junto a la mínima: sola, «66» se confundía con el 66 % de asistencia.
 * Un reprobado sin nota es quien no presentó el examen antes del cierre.
 */
const gradeLabel = (
	participant: TeachingDetail["participants"][number],
	minPassingGrade: number,
) => {
	if (participant.result === "FAILED" && participant.grade === null) {
		return "No presentó el examen final";
	}
	if (participant.grade === null) return "Calificación pendiente";
	return participant.grade >= minPassingGrade
		? `Calificación ${participant.grade} · alcanza la mínima de ${minPassingGrade}`
		: `Calificación ${participant.grade} · no alcanza la mínima de ${minPassingGrade}`;
};

/**
 * El resultado de cada participante. Solo se lee: lo escriben las evaluaciones
 * en línea, y no hay captura manual (docs/adr/0027).
 */
export function ResultsPanel({
	detail,
}: {
	detail: Pick<TeachingDetail, "participants" | "course">;
}) {
	const { participants, course } = detail;

	if (participants.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nadie está inscrito en esta capacitación.
			</p>
		);
	}

	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
				<p className="text-muted-foreground text-sm">
					La calificación es el promedio de las evaluaciones en línea y la
					calcula la plataforma; no se captura a mano. Acreditar pide además los
					demás requisitos: el detalle está en Acreditación.
				</p>
				<ul className="flex flex-col divide-y divide-border">
					{participants.map((participant) => (
						<li
							key={participant.userDocumentId}
							className="flex flex-wrap items-center justify-between gap-3 py-2"
						>
							<span className="min-w-0">
								<span className="block truncate text-sm">
									{personNameOf(participant)}
								</span>
							</span>
							<span className="text-muted-foreground text-sm">
								{gradeLabel(participant, course.minPassingGrade)}
							</span>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
