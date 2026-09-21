import { Check, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { cn } from "@/lib/utils";
import { personNameOf } from "@/modules/enrollments/utils/enrollment-labels";
import type { TeachingDetail } from "@/modules/teaching/domain/teaching.types";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { EVALUATION_NOTE_MAX_LENGTH } from "../domain/evaluation.config";
import type {
	EvaluationBoard,
	EvaluationView,
} from "../domain/evaluation.types";
import {
	EVALUATION_INTENTS,
	type EvaluationActionData,
	evaluationsPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/evaluation-form";
import {
	EvaluationDialog,
	type Sessions,
	sessionLabel,
} from "./evaluation-dialog";

type Participants = TeachingDetail["participants"];

type Verdict = "none" | "passed" | "failed";
type Draft = Record<string, { verdict: Verdict; note: string }>;

const verdictOf = (passed: boolean | null | undefined): Verdict => {
	if (passed === true) return "passed";
	return passed === false ? "failed" : "none";
};

const passedOf = (verdict: Verdict): boolean | null =>
	verdict === "none" ? null : verdict === "passed";

const draftOf = (
	participants: Participants,
	evaluation: EvaluationView | undefined,
): Draft =>
	Object.fromEntries(
		participants.map((participant) => {
			const capture = evaluation?.captures[participant.userDocumentId];
			return [
				participant.userDocumentId,
				{ verdict: verdictOf(capture?.passed), note: capture?.note ?? "" },
			];
		}),
	);

const sessionIndexOf = (sessions: Sessions, sessionDocumentId: string | null) =>
	sessions.findIndex((row) => row.documentId === sessionDocumentId);

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

	const saved = useMemo(
		() => draftOf(participants, active),
		[participants, active],
	);
	// La recarga tras cualquier envío trae objetos nuevos aunque nada cambie; solo
	// se pisa el borrador si cambió la evaluación o lo que tiene guardado.
	const savedKey = `${active?.documentId}:${JSON.stringify(saved)}`;
	const [draft, setDraft] = useState<Draft>(saved);
	const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
	// biome-ignore lint/correctness/useExhaustiveDependencies: savedKey resume a saved.
	useEffect(() => {
		setDraft(saved);
		setOpenNotes(new Set());
	}, [savedKey]);

	const pendingChanges = participants.filter((participant) => {
		const before = saved[participant.userDocumentId];
		const after = draft[participant.userDocumentId];
		return (
			before &&
			after &&
			(before.verdict !== after.verdict ||
				before.note.trim() !== after.note.trim())
		);
	}).length;

	// Una evaluación recién creada pasa a ser la activa, salvo que eso tire
	// capturas sin guardar de la que se está calificando.
	const knownIds = useRef(new Set(evaluations.map((row) => row.documentId)));
	const hasPendingChanges = useRef(false);
	hasPendingChanges.current = pendingChanges > 0;
	useEffect(() => {
		const added = evaluations.find(
			(row) => !knownIds.current.has(row.documentId),
		);
		knownIds.current = new Set(evaluations.map((row) => row.documentId));
		if (added && !hasPendingChanges.current) setDocumentId(added.documentId);
	}, [evaluations]);

	const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
	const [removing, setRemoving] = useState(false);
	const [switchTo, setSwitchTo] = useState<string | null>(null);

	const submit = (intent: string, payload: unknown) =>
		fetcher.submit(
			{ [INTENT_FIELD]: intent, [PAYLOAD_FIELD]: JSON.stringify(payload) },
			{ method: "post", action: evaluationsPath(courseDocumentId) },
		);

	const select = (next: string) => {
		if (next === active?.documentId) return;
		if (pendingChanges > 0) setSwitchTo(next);
		else setDocumentId(next);
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

	const openNote = (userDocumentId: string) =>
		setOpenNotes((previous) => new Set(previous).add(userDocumentId));

	const busy = fetcher.state !== "idle";
	const activeSession = active
		? sessionIndexOf(sessions, active.sessionDocumentId)
		: -1;

	return (
		<Card>
			<CardContent className="flex flex-col gap-5">
				<p className="text-muted-foreground text-sm">
					Sirven para dar seguimiento al grupo; no cuentan para el crédito del
					curso.
				</p>

				{evaluations.length === 0 ? (
					<div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-6">
						<div>
							<p className="font-medium text-sm">
								Este curso todavía no tiene evaluaciones
							</p>
							{canWrite && (
								<p className="text-muted-foreground text-sm">
									Crea una y califica a cada participante con aprobado o no
									aprobado.
								</p>
							)}
						</div>
						{canWrite && (
							<Button type="button" onClick={() => setDialog("create")}>
								<Plus className="size-4" aria-hidden />
								Nueva evaluación
							</Button>
						)}
					</div>
				) : (
					<div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch">
						{evaluations.map((row) => {
							const isActive = row.documentId === active?.documentId;
							const index = sessionIndexOf(sessions, row.sessionDocumentId);
							const complete =
								participants.length > 0 && row.recorded === participants.length;

							return (
								<button
									key={row.documentId}
									type="button"
									aria-pressed={isActive}
									onClick={() => select(row.documentId)}
									className={cn(
										"flex min-w-0 flex-col items-start gap-0.5 rounded-xl sm:min-w-36 border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										isActive &&
											"border-primary bg-primary/5 hover:bg-primary/5",
									)}
								>
									<span className="line-clamp-2 w-full font-medium text-sm sm:line-clamp-none sm:max-w-56 sm:truncate">
										{row.title}
									</span>
									<span className="flex items-center gap-1 text-muted-foreground text-xs">
										{index === -1 ? "Sin sesión" : `Sesión ${index + 1}`} ·{" "}
										<span className="tabular-nums">
											{row.recorded} de {participants.length}
										</span>
										{complete && (
											<Check
												className="size-3.5 text-success-foreground"
												aria-label="Todos calificados"
											/>
										)}
									</span>
								</button>
							);
						})}
						{canWrite && (
							<Button
								type="button"
								variant="ghost"
								className="col-span-2 h-auto justify-start self-stretch sm:justify-center"
								onClick={() => setDialog("create")}
							>
								<Plus className="size-4" aria-hidden />
								Nueva evaluación
							</Button>
						)}
					</div>
				)}

				{active && (
					<section
						aria-labelledby="evaluation-heading"
						className="flex flex-col gap-3 border-t pt-4"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<h3
									id="evaluation-heading"
									className="truncate font-medium text-base"
								>
									{active.title}
								</h3>
								<p className="text-muted-foreground text-xs">
									{activeSession === -1
										? "Sin sesión en particular"
										: sessionLabel(activeSession, sessions[activeSession])}
								</p>
							</div>
							{canWrite && (
								<div className="flex shrink-0 items-center gap-1">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={`Editar ${active.title}`}
										onClick={() => setDialog("edit")}
									>
										<Pencil className="size-4" aria-hidden />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={`Eliminar ${active.title}`}
										onClick={() => setRemoving(true)}
									>
										<Trash2 className="size-4" aria-hidden />
									</Button>
								</div>
							)}
						</div>

						{participants.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Nadie está inscrito en este curso.
							</p>
						) : (
							<ul className="flex flex-col divide-y divide-border">
								{participants.map((participant) => {
									const entry = draft[participant.userDocumentId];
									if (!entry) return null;

									const name = personNameOf(participant);
									const showNote =
										entry.note !== "" ||
										openNotes.has(participant.userDocumentId);

									return (
										<li
											key={participant.userDocumentId}
											className="flex flex-col gap-2 py-3"
										>
											<div className="flex flex-wrap items-center gap-3">
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm">{name}</span>
													<span className="block truncate text-muted-foreground text-xs">
														{participant.email}
													</span>
												</span>
												{canWrite ? (
													<VerdictToggle
														name={name}
														value={entry.verdict}
														onChange={(verdict) =>
															update(participant.userDocumentId, { verdict })
														}
													/>
												) : (
													<VerdictText value={entry.verdict} />
												)}
											</div>

											{canWrite && showNote && (
												<Textarea
													className="min-h-9 py-2 text-sm"
													placeholder="Observación: solo la ven quienes imparten u organizan"
													aria-label={`Observación sobre ${name}`}
													autoFocus={entry.note === ""}
													maxLength={EVALUATION_NOTE_MAX_LENGTH}
													value={entry.note}
													onChange={(event) =>
														update(participant.userDocumentId, {
															note: event.target.value,
														})
													}
												/>
											)}
											{canWrite && !showNote && (
												<Button
													type="button"
													variant="link"
													size="sm"
													className="h-auto self-start p-0 text-muted-foreground"
													onClick={() => openNote(participant.userDocumentId)}
												>
													<Plus className="size-3.5" aria-hidden />
													Añadir observación
												</Button>
											)}
											{!canWrite && entry.note !== "" && (
												<p className="text-muted-foreground text-sm">
													{entry.note}
												</p>
											)}
										</li>
									);
								})}
							</ul>
						)}

						{canWrite && participants.length > 0 && (
							<div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
								<span
									className="text-center text-muted-foreground text-sm"
									aria-live="polite"
								>
									{pendingChanges === 0
										? "Sin cambios por guardar"
										: pendingChanges === 1
											? "1 cambio sin guardar"
											: `${pendingChanges} cambios sin guardar`}
								</span>
								<Button
									type="button"
									onClick={saveCaptures}
									disabled={busy || pendingChanges === 0}
								>
									<Save className="size-4" aria-hidden />
									Guardar calificaciones
								</Button>
							</div>
						)}
					</section>
				)}
			</CardContent>

			{canWrite && (
				<EvaluationDialog
					open={dialog !== null}
					onOpenChange={(open) => !open && setDialog(null)}
					courseDocumentId={courseDocumentId}
					sessions={sessions}
					evaluation={dialog === "edit" ? (active ?? null) : null}
				/>
			)}

			{active && (
				<ConfirmDialog
					open={removing}
					onOpenChange={setRemoving}
					title={`¿Eliminar ${active.title}?`}
					description="Se borra junto con sus calificaciones y observaciones. No afecta a la asistencia ni al resultado del curso."
					confirmLabel="Eliminar"
					destructive
					onConfirm={() => {
						submit(EVALUATION_INTENTS.remove, {
							evaluationDocumentId: active.documentId,
						});
						setRemoving(false);
					}}
				/>
			)}

			<ConfirmDialog
				open={switchTo !== null}
				onOpenChange={(open) => !open && setSwitchTo(null)}
				title="¿Descartar los cambios?"
				description="Tienes calificaciones sin guardar en esta evaluación."
				confirmLabel="Descartar"
				cancelLabel="Seguir calificando"
				destructive
				onConfirm={() => {
					if (switchTo) setDocumentId(switchTo);
					setSwitchTo(null);
				}}
			/>
		</Card>
	);
}

/** Aprobado / No aprobado; pulsar el que ya está marcado lo deja sin calificar. */
function VerdictToggle({
	name,
	value,
	onChange,
}: {
	name: string;
	value: Verdict;
	onChange: (verdict: Verdict) => void;
}) {
	const toggle = (verdict: Verdict) =>
		onChange(value === verdict ? "none" : verdict);

	return (
		<fieldset className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto">
			<legend className="sr-only">Calificación de {name}</legend>
			<Button
				type="button"
				size="sm"
				variant="outline"
				aria-pressed={value === "passed"}
				className={cn(
					"text-muted-foreground",
					value === "passed" &&
						"border-success-foreground/50 bg-success text-success-foreground hover:bg-success hover:text-success-foreground dark:bg-success",
				)}
				onClick={() => toggle("passed")}
			>
				<Check className="size-4" aria-hidden />
				Aprobado
			</Button>
			<Button
				type="button"
				size="sm"
				variant="outline"
				aria-pressed={value === "failed"}
				className={cn(
					"text-muted-foreground",
					value === "failed" &&
						"border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:bg-destructive/20",
				)}
				onClick={() => toggle("failed")}
			>
				<X className="size-4" aria-hidden />
				No aprobado
			</Button>
		</fieldset>
	);
}

function VerdictText({ value }: { value: Verdict }) {
	if (value === "none") {
		return <span className="text-muted-foreground text-sm">Sin calificar</span>;
	}

	return value === "passed" ? (
		<span className="flex items-center gap-1 text-sm text-success-foreground">
			<Check className="size-4" aria-hidden />
			Aprobado
		</span>
	) : (
		<span className="flex items-center gap-1 text-destructive text-sm">
			<X className="size-4" aria-hidden />
			No aprobado
		</span>
	);
}
