import {
	ENROLLMENT_RESULT_LABELS,
	personNameOf,
} from "@/modules/enrollments/utils/enrollment-labels";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { TeachingDetail } from "../domain/teaching.types";

/** Un reprobado sin nota es quien no presentó el examen antes del cierre. */
const resultLabel = (participant: TeachingDetail["participants"][number]) => {
	if (participant.result === "PENDING") return "Sin presentar";
	if (participant.result === "FAILED" && participant.grade === null) {
		return "No presentó";
	}
	return `${ENROLLMENT_RESULT_LABELS[participant.result]} · ${participant.grade}`;
};

/**
 * El resultado de cada participante. Solo se lee: lo escriben las evaluaciones
 * en línea, y no hay captura manual (docs/adr/0027).
 */
export function ResultsPanel({
	detail,
}: {
	detail: Pick<TeachingDetail, "participants">;
}) {
	const { participants } = detail;

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
					La calificación la calcula la plataforma con las evaluaciones en
					línea; no se captura a mano.
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
								<span className="block truncate text-muted-foreground text-xs">
									Asistencia {participant.attendancePercent} %
								</span>
							</span>
							<span className="text-muted-foreground text-sm">
								{resultLabel(participant)}
							</span>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
