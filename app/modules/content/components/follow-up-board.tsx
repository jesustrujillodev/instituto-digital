import { Lock, Play } from "lucide-react";
import { useFetcher } from "react-router";
import { formatZonedDateTime, formatZonedUntil } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
	type SessionRefs,
	sessionNumberLabel,
} from "@/modules/courses/utils/session-label";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import type { FollowUpState } from "../domain/quiz.rules";
import type { FollowUpBoard, FollowUpView } from "../domain/quiz.types";
import {
	CONTENT_INTENTS,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	retakePath,
} from "../utils/content-form";
import { AVAILABILITY_SHORT } from "./follow-up-list";

const STATE_LABELS: Record<FollowUpState, string> = {
	SCHEDULED: "Programada",
	OPEN: "Abierta",
	CLOSED: "Cerrada",
};

interface BoardParticipant {
	userDocumentId: string;
	name: string;
	/** Por sesión: `true` si registró asistencia. */
	marks: Record<string, boolean | null>;
}

/** «Abre 12-10-2026 10:00 · cierra 12:00», con lo que se sepa. */
const windowLabel = (followUp: FollowUpView) => {
	const opensAt = followUp.opensAt ? new Date(followUp.opensAt) : null;
	const closesAt = followUp.closesAt ? new Date(followUp.closesAt) : null;
	const parts = [
		opensAt && `abre ${formatZonedDateTime(opensAt)}`,
		closesAt &&
			`cierra ${opensAt ? formatZonedUntil(opensAt, closesAt) : formatZonedDateTime(closesAt)}`,
	].filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : AVAILABILITY_SHORT.MANUAL;
};

/** Lo que sacó una persona: la nota, o por qué no la tiene. */
const scoreLabel = (
	followUp: FollowUpView,
	best: number | undefined,
	attended: boolean,
) => {
	if (best !== undefined) return String(best);
	if (followUp.state !== "CLOSED") return attended ? "Sin presentar" : "—";
	return followUp.countsTowardGrade ? "0 · no presentó" : "No presentó";
};

/**
 * Las evaluaciones de seguimiento de la capacitación (docs/adr/0027): su
 * ventana, abrir y cerrar las manuales, y la mejor nota de cada quien.
 */
export function FollowUpBoardPanel({
	courseDocumentId,
	board,
	sessions,
	participants,
}: {
	courseDocumentId: string;
	board: FollowUpBoard;
	sessions: SessionRefs;
	participants: readonly BoardParticipant[];
}) {
	const fetcher = useFetcher<AppResponse<null>>();
	useFetcherToast(fetcher);
	const busy = fetcher.state !== "idle";

	const bestOf = new Map(
		board.scores.map((row) => [
			`${row.quizDocumentId}:${row.userDocumentId}`,
			row.score,
		]),
	);

	const toggle = (intent: string, followUpDocumentId: string) =>
		fetcher.submit(
			{
				[INTENT_FIELD]: intent,
				[PAYLOAD_FIELD]: JSON.stringify({ followUpDocumentId }),
			},
			{ method: "post", action: retakePath(courseDocumentId) },
		);

	return (
		<div className="flex flex-col gap-4">
			<p className="text-muted-foreground text-sm">
				Exámenes en línea de cada sesión. Los presenta quien registró su
				asistencia; las que cuentan entran al promedio y quien no las presenta
				saca 0.
			</p>
			{board.followUps.map((followUp) => {
				const manual = followUp.availability === "MANUAL";
				return (
					<Card key={followUp.documentId}>
						<CardContent className="flex flex-col gap-4">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0">
									<h3 className="truncate font-medium text-base">
										{followUp.title}
									</h3>
									<p className="text-muted-foreground text-xs">
										{[
											sessionNumberLabel(sessions, followUp.sessionDocumentId),
											windowLabel(followUp),
											followUp.countsTowardGrade
												? "cuenta para la calificación"
												: "no cuenta",
										]
											.filter(Boolean)
											.join(" · ")}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Badge
										variant="outline"
										className={cn(
											followUp.state === "OPEN" &&
												"border-transparent bg-success text-success-foreground",
										)}
									>
										{STATE_LABELS[followUp.state]}
									</Badge>
									{manual &&
										board.canToggle &&
										followUp.state === "SCHEDULED" && (
											<Button
												type="button"
												size="sm"
												disabled={busy || followUp.questionCount === 0}
												onClick={() =>
													toggle(
														CONTENT_INTENTS.openFollowUp,
														followUp.documentId,
													)
												}
											>
												<Play aria-hidden="true" />
												Abrir
											</Button>
										)}
									{manual && board.canToggle && followUp.state === "OPEN" && (
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={busy || followUp.questionCount === 0}
												>
													<Lock aria-hidden="true" />
													Cerrar
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														¿Cerrar «{followUp.title}»?
													</AlertDialogTitle>
													<AlertDialogDescription>
														{followUp.countsTowardGrade
															? "Nadie podrá presentarla después y no se puede volver a abrir. Quien no la haya presentado queda con 0 en esta evaluación."
															: "Nadie podrá presentarla después y no se puede volver a abrir."}
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Cancelar</AlertDialogCancel>
													<AlertDialogAction
														onClick={() =>
															toggle(
																CONTENT_INTENTS.closeFollowUp,
																followUp.documentId,
															)
														}
													>
														Cerrar evaluación
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									)}
								</div>
							</div>

							{participants.length > 0 && (
								<ul className="flex flex-col divide-y divide-border border-border border-t">
									{participants.map((participant) => (
										<li
											key={participant.userDocumentId}
											className="flex items-center justify-between gap-3 py-2"
										>
											<span className="min-w-0 truncate text-sm">
												{participant.name}
											</span>
											<span className="text-muted-foreground text-sm tabular-nums">
												{scoreLabel(
													followUp,
													bestOf.get(
														`${followUp.documentId}:${participant.userDocumentId}`,
													),
													participant.marks[followUp.sessionDocumentId] ===
														true,
												)}
											</span>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
