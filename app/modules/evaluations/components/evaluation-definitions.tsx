import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { EVALUATIONS_PER_COURSE_LIMIT } from "../domain/evaluation.config";
import type { EvaluationView } from "../domain/evaluation.types";
import {
	EVALUATION_INTENTS,
	type EvaluationActionData,
	evaluationDefinitionsPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/evaluation-form";
import {
	EvaluationDialog,
	type Sessions,
	sessionLabel,
} from "./evaluation-dialog";

const whenOf = (evaluation: EvaluationView, sessions: Sessions) => {
	const index = sessions.findIndex(
		(row) => row.documentId === evaluation.sessionDocumentId,
	);
	return index === -1
		? "Sin sesión en particular"
		: sessionLabel(index, sessions[index]);
};

/**
 * Las evaluaciones de seguimiento de un curso, tal como se definen al crearlo
 * o editarlo. Se guardan una a una, sin esperar al paso: quien imparte solo
 * captura sus resultados.
 */
export function EvaluationDefinitions({
	courseDocumentId,
	evaluations,
	sessions,
}: {
	courseDocumentId: string;
	evaluations: readonly EvaluationView[];
	sessions: Sessions;
}) {
	const fetcher = useFetcher<EvaluationActionData>();
	useFetcherToast(fetcher);

	const [editing, setEditing] = useState<EvaluationView | "new" | null>(null);
	const [removing, setRemoving] = useState<EvaluationView | null>(null);

	const canAdd = evaluations.length < EVALUATIONS_PER_COURSE_LIMIT;

	return (
		<fieldset className="flex flex-col gap-3">
			<legend className="mb-1 font-medium text-sm">
				Evaluaciones de seguimiento
			</legend>
			<p className="text-muted-foreground text-sm">
				Exámenes o prácticas a lo largo del curso. Quien imparte captura
				aprobado o no aprobado en cada una; no cuentan para el crédito.
			</p>

			{evaluations.length > 0 && (
				<ul className="flex flex-col divide-y divide-border rounded-xl ring-1 ring-foreground/10">
					{evaluations.map((evaluation) => (
						<li
							key={evaluation.documentId}
							className="flex items-center gap-3 py-2 pr-2 pl-4"
						>
							<ClipboardList
								className="size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm">{evaluation.title}</p>
								<p className="truncate text-muted-foreground text-xs">
									{whenOf(evaluation, sessions)}
									{evaluation.recorded > 0 &&
										` · ${evaluation.recorded} ${evaluation.recorded === 1 ? "calificado" : "calificados"}`}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={`Editar ${evaluation.title}`}
								onClick={() => setEditing(evaluation)}
							>
								<Pencil aria-hidden="true" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={`Eliminar ${evaluation.title}`}
								onClick={() => setRemoving(evaluation)}
							>
								<Trash2 aria-hidden="true" />
							</Button>
						</li>
					))}
				</ul>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					variant="outline"
					disabled={!canAdd}
					onClick={() => setEditing("new")}
				>
					<Plus aria-hidden="true" />
					Agregar evaluación de seguimiento
				</Button>
				{!canAdd && (
					<span className="text-muted-foreground text-xs">
						Máximo {EVALUATIONS_PER_COURSE_LIMIT} evaluaciones.
					</span>
				)}
			</div>

			<EvaluationDialog
				open={editing !== null}
				onOpenChange={(open) => !open && setEditing(null)}
				courseDocumentId={courseDocumentId}
				sessions={sessions}
				evaluation={editing === "new" ? null : editing}
			/>

			<ConfirmDialog
				open={removing !== null}
				onOpenChange={(open) => !open && setRemoving(null)}
				title={`¿Eliminar ${removing?.title ?? "la evaluación"}?`}
				description={
					removing && removing.recorded > 0
						? "Se borra junto con las calificaciones y observaciones ya capturadas. No afecta a la asistencia ni al resultado del curso."
						: "No afecta a la asistencia ni al resultado del curso."
				}
				confirmLabel="Eliminar"
				destructive
				onConfirm={() => {
					if (removing) {
						fetcher.submit(
							{
								[INTENT_FIELD]: EVALUATION_INTENTS.remove,
								[PAYLOAD_FIELD]: JSON.stringify({
									evaluationDocumentId: removing.documentId,
								}),
							},
							{
								method: "post",
								action: evaluationDefinitionsPath(courseDocumentId),
							},
						);
					}
					setRemoving(null);
				}}
			/>
		</fieldset>
	);
}
