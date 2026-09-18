import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { formatSessionRange } from "@/lib/date-utils";
import { personNameOf } from "@/modules/enrollments/utils/enrollment-labels";
import type { TeachingDetail } from "@/modules/teaching/domain/teaching.types";
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
import { Input } from "@/shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import {
	EVALUATION_NOTE_MAX_LENGTH,
	EVALUATION_TITLE_MAX_LENGTH,
} from "../domain/evaluation.config";
import type {
	EvaluationBoard,
	EvaluationCapture,
} from "../domain/evaluation.types";
import {
	EVALUATION_INTENTS,
	type EvaluationActionData,
	evaluationsPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/evaluation-form";

type Sessions = TeachingDetail["sessions"];
type Participants = TeachingDetail["participants"];

/** El valor del selector cuando la evaluación no cuelga de ninguna sesión. */
const NO_SESSION = "none";

type Verdict = "none" | "passed" | "failed";
type Draft = Record<string, { verdict: Verdict; note: string }>;

const verdictOf = (passed: boolean | null | undefined): Verdict => {
	if (passed === true) return "passed";
	return passed === false ? "failed" : "none";
};

const passedOf = (verdict: Verdict): boolean | null =>
	verdict === "none" ? null : verdict === "passed";

const sessionLabel = (index: number, session: Sessions[number]) =>
	`Sesión ${index + 1} · ${formatSessionRange(
		new Date(session.startsAt),
		new Date(session.endsAt),
	)}`;

const evaluationLabel = (
	sessions: Sessions,
	sessionDocumentId: string | null,
) => {
	const index = sessions.findIndex(
		(row) => row.documentId === sessionDocumentId,
	);
	return index === -1 ? "Sin sesión" : sessionLabel(index, sessions[index]);
};

export function EvaluationsPanel({
	courseDocumentId,
	board,
	sessions,
	participants,
}: {
	courseDocumentId: string;
	board: EvaluationBoard;
	sessions: Sessions;
	participants: Participants;
}) {
	const { canWrite, evaluations } = board;
	const fetcher = useFetcher<EvaluationActionData>();
	useFetcherToast(fetcher);

	const [documentId, setDocumentId] = useState(
		() => evaluations.at(0)?.documentId ?? "",
	);
	const active =
		evaluations.find((row) => row.documentId === documentId) ??
		evaluations.at(0);

	const draftOf = (captures: Record<string, EvaluationCapture>): Draft =>
		Object.fromEntries(
			participants.map((participant) => {
				const capture = captures[participant.userDocumentId];
				return [
					participant.userDocumentId,
					{ verdict: verdictOf(capture?.passed), note: capture?.note ?? "" },
				];
			}),
		);

	const [draft, setDraft] = useState<Draft>(() =>
		draftOf(active?.captures ?? {}),
	);
	// Al cambiar de evaluación o al recargar tras guardar, vuelve a lo guardado.
	// biome-ignore lint/correctness/useExhaustiveDependencies: draftOf se deriva de participants.
	useEffect(() => {
		setDraft(draftOf(active?.captures ?? {}));
	}, [active, participants]);

	const [title, setTitle] = useState("");
	const [sessionId, setSessionId] = useState(NO_SESSION);
	const [editing, setEditing] = useState(false);

	const submit = (intent: string, payload: unknown) =>
		fetcher.submit(
			{ [INTENT_FIELD]: intent, [PAYLOAD_FIELD]: JSON.stringify(payload) },
			{ method: "post", action: evaluationsPath(courseDocumentId) },
		);

	const startEditing = () => {
		if (!active) return;
		setTitle(active.title);
		setSessionId(active.sessionDocumentId ?? NO_SESSION);
		setEditing(true);
	};

	const resetForm = () => {
		setTitle("");
		setSessionId(NO_SESSION);
		setEditing(false);
	};

	const saveEvaluation = () => {
		const shared = {
			title,
			sessionDocumentId: sessionId === NO_SESSION ? null : sessionId,
		};

		if (editing && active) {
			submit(EVALUATION_INTENTS.update, {
				evaluationDocumentId: active.documentId,
				...shared,
			});
		} else {
			submit(EVALUATION_INTENTS.create, shared);
		}
		resetForm();
	};

	const saveCaptures = () => {
		if (!active) return;

		submit(EVALUATION_INTENTS.results, {
			evaluationDocumentId: active.documentId,
			entries: Object.entries(draft).map(([userDocumentId, entry]) => ({
				userDocumentId,
				passed: passedOf(entry.verdict),
				note: entry.note,
			})),
		});
	};

	const update = (userDocumentId: string, patch: Partial<Draft[string]>) =>
		setDraft((previous) => ({
			...previous,
			[userDocumentId]: { ...previous[userDocumentId], ...patch },
		}));

	const busy = fetcher.state !== "idle";

	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
				<p className="text-muted-foreground text-sm">
					Un curso puede tener varias evaluaciones. Se captura aprobado o no
					aprobado y una observación opcional, que solo ven quienes imparten u
					organizan. El resultado que otorga el crédito sigue siendo el de la
					pestaña Resultados.
				</p>

				{evaluations.length > 0 && (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<Select
							value={active?.documentId ?? ""}
							onValueChange={setDocumentId}
						>
							<SelectTrigger className="w-full sm:w-96">
								<SelectValue placeholder="Evaluación" />
							</SelectTrigger>
							<SelectContent>
								{evaluations.map((row) => (
									<SelectItem key={row.documentId} value={row.documentId}>
										{row.title} ·{" "}
										{evaluationLabel(sessions, row.sessionDocumentId)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<div className="flex items-center gap-2">
							{active && (
								<Badge variant="outline">
									Capturadas {active.recorded} de {participants.length}
								</Badge>
							)}
							{canWrite && active && (
								<>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Editar evaluación"
										onClick={startEditing}
									>
										<Pencil className="size-4" aria-hidden />
									</Button>
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label="Eliminar evaluación"
											>
												<Trash2 className="size-4" aria-hidden />
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													¿Eliminar {active.title}?
												</AlertDialogTitle>
												<AlertDialogDescription>
													Se borra junto con todo lo capturado en ella. No
													afecta a la asistencia ni al resultado final del
													curso.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>Cancelar</AlertDialogCancel>
												<AlertDialogAction
													onClick={() =>
														submit(EVALUATION_INTENTS.remove, {
															evaluationDocumentId: active.documentId,
														})
													}
												>
													Eliminar
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</>
							)}
						</div>
					</div>
				)}

				{canWrite && (
					<div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/50 p-3">
						<Input
							className="min-w-40 flex-1"
							placeholder="Título de la evaluación"
							aria-label="Título de la evaluación"
							maxLength={EVALUATION_TITLE_MAX_LENGTH}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
						/>
						<Select value={sessionId} onValueChange={setSessionId}>
							<SelectTrigger className="w-full sm:w-72">
								<SelectValue placeholder="Sesión" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_SESSION}>Sin sesión</SelectItem>
								{sessions.map((row, index) => (
									<SelectItem key={row.documentId} value={row.documentId}>
										{sessionLabel(index, row)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							type="button"
							onClick={saveEvaluation}
							disabled={busy || title.trim() === ""}
						>
							{editing ? (
								<Save className="size-4" aria-hidden />
							) : (
								<Plus className="size-4" aria-hidden />
							)}
							{editing ? "Guardar cambios" : "Añadir evaluación"}
						</Button>
						{editing && (
							<Button type="button" variant="ghost" onClick={resetForm}>
								<X className="size-4" aria-hidden />
								Cancelar
							</Button>
						)}
					</div>
				)}

				{evaluations.length === 0 && (
					<p className="text-muted-foreground text-sm">
						Este curso todavía no tiene evaluaciones.
					</p>
				)}

				{evaluations.length > 0 && participants.length === 0 && (
					<p className="text-muted-foreground text-sm">
						Nadie está inscrito en este curso.
					</p>
				)}

				{evaluations.length > 0 && participants.length > 0 && (
					<>
						<ul className="flex flex-col divide-y divide-border">
							{participants.map((participant) => {
								const entry = draft[participant.userDocumentId];
								if (!entry) return null;

								return (
									<li
										key={participant.userDocumentId}
										className="flex flex-col gap-2 py-3"
									>
										<div className="flex flex-wrap items-center gap-3">
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm">
													{personNameOf(participant)}
												</span>
												<span className="block truncate text-muted-foreground text-xs">
													{participant.email}
												</span>
											</span>
											<Select
												value={entry.verdict}
												disabled={!canWrite}
												onValueChange={(value) =>
													update(participant.userDocumentId, {
														verdict: value as Verdict,
													})
												}
											>
												<SelectTrigger className="w-40">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">Sin capturar</SelectItem>
													<SelectItem value="passed">Aprobado</SelectItem>
													<SelectItem value="failed">No aprobado</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<Textarea
											className="min-h-9 py-2 text-sm"
											placeholder="Observación (opcional)"
											aria-label={`Observación de ${personNameOf(participant)}`}
											maxLength={EVALUATION_NOTE_MAX_LENGTH}
											value={entry.note}
											disabled={!canWrite}
											onChange={(event) =>
												update(participant.userDocumentId, {
													note: event.target.value,
												})
											}
										/>
									</li>
								);
							})}
						</ul>

						{canWrite && (
							<div className="flex justify-end">
								<Button onClick={saveCaptures} disabled={busy}>
									<Save className="size-4" aria-hidden />
									Guardar evaluación
								</Button>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
