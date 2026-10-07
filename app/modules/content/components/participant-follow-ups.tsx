import { ClipboardCheck } from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate, formatZonedTime } from "@/lib/date-utils";
import {
	type SessionRefs,
	sessionNumberLabel,
} from "@/modules/courses/utils/session-label";
import { Button } from "@/shared/components/ui/button";
import type { ParticipantFollowUp } from "../domain/quiz.types";
import { followUpPath } from "../utils/content-form";

/** Qué puede hacer ahora con ella, en una línea. */
const statusOf = (followUp: ParticipantFollowUp): string => {
	switch (followUp.availability) {
		case "AVAILABLE":
			return followUp.best === null
				? "Abierta: ya puedes presentarla."
				: `Tu mejor calificación: ${followUp.best}. Puedes volver a intentarlo.`;
		case "TAKEN":
			return `Tu calificación: ${followUp.best ?? "—"}.`;
		case "NOT_YET":
			return followUp.opensAt
				? `Se abre el ${formatZonedDate(new Date(followUp.opensAt))} a las ${formatZonedTime(new Date(followUp.opensAt))}.`
				: "La abre quien imparte la sesión.";
		case "NOT_ATTENDED":
			return "Registra tu asistencia a la sesión para presentarla.";
		case "CLOSED":
			if (followUp.best !== null) return `Tu calificación: ${followUp.best}.`;
			return followUp.countsTowardGrade
				? "Se cerró sin que la presentaras: cuenta como 0."
				: "Se cerró sin que la presentaras.";
		default:
			return "";
	}
};

/**
 * Las evaluaciones de seguimiento del participante (docs/adr/0027), con un
 * enlace a presentarlas. La comparten la pantalla del QR y el detalle de la
 * capacitación.
 */
export function ParticipantFollowUps({
	courseDocumentId,
	followUps,
	sessions,
}: {
	courseDocumentId: string;
	followUps: readonly ParticipantFollowUp[];
	/** Con sesiones, cada evaluación dice de cuál es. */
	sessions?: SessionRefs;
}) {
	if (followUps.length === 0) return null;

	return (
		<ul className="flex flex-col gap-2">
			{followUps.map((followUp) => {
				const session = sessions
					? sessionNumberLabel(sessions, followUp.sessionDocumentId)
					: null;
				const canOpen =
					followUp.availability === "AVAILABLE" ||
					followUp.availability === "TAKEN" ||
					(followUp.availability === "CLOSED" && followUp.best !== null);

				return (
					<li
						key={followUp.documentId}
						className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3"
					>
						<ClipboardCheck
							className="size-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<div className="min-w-0 flex-1">
							<p className="font-medium text-sm">
								{followUp.title}
								{session && (
									<span className="font-normal text-muted-foreground">
										{" "}
										· {session}
									</span>
								)}
							</p>
							<p className="text-muted-foreground text-xs">
								{statusOf(followUp)}
							</p>
						</div>
						{canOpen && (
							<Button
								asChild
								size="sm"
								variant={
									followUp.availability === "AVAILABLE" ? "default" : "outline"
								}
							>
								<Link to={followUpPath(courseDocumentId, followUp.documentId)}>
									{followUp.availability === "AVAILABLE"
										? "Presentar"
										: "Ver resultado"}
								</Link>
							</Button>
						)}
					</li>
				);
			})}
		</ul>
	);
}
