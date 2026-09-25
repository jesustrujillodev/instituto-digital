import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import {
	COURSE_MODALITIES,
	type CourseModality,
} from "@/modules/courses/domain/course.rules";
import { MODALITY_LABELS } from "@/modules/courses/utils/course-labels";
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
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { MONTHS, PLAN_TEXT_LIMITS } from "../domain/annual-plan.config";
import type { PlanLineView } from "../domain/annual-plan.types";
import {
	INTENT_FIELD,
	LINE_FIELD,
	PAYLOAD_FIELD,
	PLAN_INTENTS,
	type PlanActionData,
} from "../utils/parse-plan-form-data";
import { MONTH_LABELS } from "../utils/plan-labels";

/** Radix no admite un `SelectItem` con valor vacío. */
const NO_MODALITY = "none";

interface Draft {
	title: string;
	plannedMonth: string;
	plannedModality: string;
	estimatedDuration: string;
	targetAudience: string;
	notes: string;
}

const draftOf = (line: PlanLineView | null): Draft => ({
	title: line?.title ?? "",
	plannedMonth: String(line?.plannedMonth ?? 1),
	plannedModality: line?.plannedModality ?? NO_MODALITY,
	estimatedDuration: line?.estimatedDuration ?? "",
	targetAudience: line?.targetAudience ?? "",
	notes: line?.notes ?? "",
});

/**
 * Alta y edición de una línea. Formulario plano, sin react-hook-form: seis
 * campos independientes y la validación de verdad es la regla del servidor.
 */
export function PlanLineDialog({
	open,
	onOpenChange,
	line,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** `null` para una línea nueva. */
	line: PlanLineView | null;
}) {
	const fetcher = useFetcher<PlanActionData>();
	// Una vez por respuesta: un efecto sobre `fetcher.data` volvería a cerrar el
	// diálogo al reabrirlo, porque el éxito anterior sigue ahí.
	useFetcherToast(fetcher, { onSuccess: () => onOpenChange(false) });
	const id = useId();
	const [draft, setDraft] = useState<Draft>(() => draftOf(line));

	useEffect(() => {
		if (open) setDraft(draftOf(line));
	}, [open, line]);

	const set = (key: keyof Draft) => (value: string) =>
		setDraft((previous) => ({ ...previous, [key]: value }));

	const submit = () =>
		fetcher.submit(
			{
				[INTENT_FIELD]: line ? PLAN_INTENTS.updateLine : PLAN_INTENTS.addLine,
				...(line && { [LINE_FIELD]: line.documentId }),
				[PAYLOAD_FIELD]: JSON.stringify({
					title: draft.title,
					plannedMonth: Number(draft.plannedMonth),
					plannedModality:
						draft.plannedModality === NO_MODALITY
							? null
							: (draft.plannedModality as CourseModality),
					estimatedDuration: draft.estimatedDuration,
					targetAudience: draft.targetAudience,
					notes: draft.notes,
				}),
			},
			{ method: "post" },
		);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{line ? "Editar línea" : "Nueva línea"}</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-title`}>Título tentativo</Label>
						<Input
							id={`${id}-title`}
							value={draft.title}
							maxLength={PLAN_TEXT_LIMITS.title}
							onChange={(event) => set("title")(event.target.value)}
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${id}-month`}>Mes previsto</Label>
							<Select
								value={draft.plannedMonth}
								onValueChange={set("plannedMonth")}
							>
								<SelectTrigger id={`${id}-month`}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{MONTHS.map((month) => (
										<SelectItem key={month} value={String(month)}>
											{MONTH_LABELS[month]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${id}-modality`}>Modalidad prevista</Label>
							<Select
								value={draft.plannedModality}
								onValueChange={set("plannedModality")}
							>
								<SelectTrigger id={`${id}-modality`}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_MODALITY}>Sin definir</SelectItem>
									{COURSE_MODALITIES.map((modality) => (
										<SelectItem key={modality} value={modality}>
											{MODALITY_LABELS[modality]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${id}-duration`}>Duración estimada</Label>
							<Input
								id={`${id}-duration`}
								placeholder="1 sesión, 3 semanas…"
								value={draft.estimatedDuration}
								maxLength={PLAN_TEXT_LIMITS.estimatedDuration}
								onChange={(event) =>
									set("estimatedDuration")(event.target.value)
								}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${id}-audience`}>Público objetivo</Label>
							<Input
								id={`${id}-audience`}
								value={draft.targetAudience}
								maxLength={PLAN_TEXT_LIMITS.targetAudience}
								onChange={(event) => set("targetAudience")(event.target.value)}
							/>
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-notes`}>Notas</Label>
						<Textarea
							id={`${id}-notes`}
							value={draft.notes}
							maxLength={PLAN_TEXT_LIMITS.notes}
							onChange={(event) => set("notes")(event.target.value)}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						onClick={submit}
						disabled={draft.title.trim() === "" || fetcher.state !== "idle"}
					>
						{line ? "Guardar cambios" : "Agregar línea"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
