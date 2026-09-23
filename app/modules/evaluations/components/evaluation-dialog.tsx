import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import { formatSessionRange } from "@/lib/date-utils";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { EVALUATION_TITLE_MAX_LENGTH } from "../domain/evaluation.config";
import type { EvaluationView } from "../domain/evaluation.types";
import {
	EVALUATION_INTENTS,
	type EvaluationActionData,
	evaluationDefinitionsPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/evaluation-form";

/** Lo justo de cada sesión para nombrarla: la ficha y el alta la traen así. */
export type Sessions = readonly {
	documentId: string;
	startsAt: Date | string;
	endsAt: Date | string;
}[];

/** Radix no admite un `SelectItem` con valor vacío. */
const NO_SESSION = "none";

export const sessionLabel = (index: number, session: Sessions[number]) =>
	`Sesión ${index + 1} · ${formatSessionRange(
		new Date(session.startsAt),
		new Date(session.endsAt),
	)}`;

/** Alta y edición de una evaluación: solo su título y la sesión en que se aplica. */
export function EvaluationDialog({
	open,
	onOpenChange,
	courseDocumentId,
	sessions,
	evaluation,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	courseDocumentId: string;
	sessions: Sessions;
	/** `null` para una evaluación nueva. */
	evaluation: EvaluationView | null;
}) {
	const fetcher = useFetcher<EvaluationActionData>();
	useFetcherToast(fetcher);
	const id = useId();

	const [title, setTitle] = useState("");
	const [sessionId, setSessionId] = useState(NO_SESSION);

	useEffect(() => {
		if (!open) return;
		setTitle(evaluation?.title ?? "");
		setSessionId(evaluation?.sessionDocumentId ?? NO_SESSION);
	}, [open, evaluation]);

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.success) onOpenChange(false);
	}, [fetcher.state, fetcher.data, onOpenChange]);

	const busy = fetcher.state !== "idle";

	const submit = () => {
		const shared = {
			title,
			sessionDocumentId: sessionId === NO_SESSION ? null : sessionId,
		};

		fetcher.submit(
			{
				[INTENT_FIELD]: evaluation
					? EVALUATION_INTENTS.update
					: EVALUATION_INTENTS.create,
				[PAYLOAD_FIELD]: JSON.stringify(
					evaluation
						? { evaluationDocumentId: evaluation.documentId, ...shared }
						: shared,
				),
			},
			{ method: "post", action: evaluationDefinitionsPath(courseDocumentId) },
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{evaluation ? "Editar evaluación" : "Nueva evaluación"}
					</DialogTitle>
				</DialogHeader>

				<form
					id={`${id}-form`}
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						// El diálogo vive en un portal, pero React propaga el envío por su
						// árbol: sin esto también se enviaría el formulario del paso.
						event.stopPropagation();
						submit();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-title`}>Nombre</Label>
						<Input
							id={`${id}-title`}
							placeholder="Examen parcial, práctica final…"
							maxLength={EVALUATION_TITLE_MAX_LENGTH}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-session`}>Se aplica en</Label>
						<Select value={sessionId} onValueChange={setSessionId}>
							<SelectTrigger id={`${id}-session`} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_SESSION}>
									Sin sesión en particular
								</SelectItem>
								{sessions.map((row, index) => (
									<SelectItem key={row.documentId} value={row.documentId}>
										{sessionLabel(index, row)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</form>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button
						type="submit"
						form={`${id}-form`}
						disabled={busy || title.trim() === ""}
					>
						{evaluation ? "Guardar cambios" : "Crear evaluación"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
