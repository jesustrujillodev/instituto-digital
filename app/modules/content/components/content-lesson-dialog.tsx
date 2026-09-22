import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
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
import {
	CONTENT_TITLE_MAX_LENGTH,
	LESSON_MAX_ESTIMATED_MINUTES,
} from "../domain/content.config";
import { LESSON_TYPES, type LessonType } from "../domain/content.rules";
import type { ContentLesson } from "../domain/content.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	contentPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/content-form";
import { LESSON_TYPE_HINTS, LESSON_TYPE_LABELS } from "../utils/content-labels";

/** Alta y edición de una lección. El material llega después: aquí va su ficha. */
export function ContentLessonDialog({
	open,
	onOpenChange,
	courseDocumentId,
	moduleDocumentId,
	lesson,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	courseDocumentId: string;
	/** El módulo al que se añade; `null` mientras el diálogo está cerrado. */
	moduleDocumentId: string | null;
	/** `null` para una lección nueva. */
	lesson: ContentLesson | null;
}) {
	const fetcher = useFetcher<ContentActionData>();
	useFetcherToast(fetcher);
	const id = useId();

	const [title, setTitle] = useState("");
	const [type, setType] = useState<LessonType>("TEXT");
	const [isRequired, setIsRequired] = useState(true);
	const [minutes, setMinutes] = useState("");

	useEffect(() => {
		if (!open) return;
		setTitle(lesson?.title ?? "");
		setType(lesson?.type ?? "TEXT");
		setIsRequired(lesson?.isRequired ?? true);
		setMinutes(
			lesson?.estimatedMinutes === null ||
				lesson?.estimatedMinutes === undefined
				? ""
				: String(lesson.estimatedMinutes),
		);
	}, [open, lesson]);

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.success) onOpenChange(false);
	}, [fetcher.state, fetcher.data, onOpenChange]);

	const busy = fetcher.state !== "idle";

	const submit = () => {
		const shared = {
			title,
			type,
			isRequired,
			estimatedMinutes: minutes.trim() === "" ? null : Number(minutes),
		};

		fetcher.submit(
			{
				[INTENT_FIELD]: lesson
					? CONTENT_INTENTS.updateLesson
					: CONTENT_INTENTS.createLesson,
				[PAYLOAD_FIELD]: JSON.stringify(
					lesson
						? { lessonDocumentId: lesson.documentId, ...shared }
						: { moduleDocumentId, ...shared },
				),
			},
			{ method: "post", action: contentPath(courseDocumentId) },
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{lesson ? "Editar lección" : "Nueva lección"}
					</DialogTitle>
				</DialogHeader>

				<form
					id={`${id}-form`}
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-title`}>Nombre</Label>
						<Input
							id={`${id}-title`}
							placeholder="Qué se aprende en esta lección"
							maxLength={CONTENT_TITLE_MAX_LENGTH}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-type`}>Tipo de material</Label>
						<Select
							value={type}
							onValueChange={(value) => setType(value as LessonType)}
						>
							<SelectTrigger id={`${id}-type`} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{LESSON_TYPES.map((value) => (
									<SelectItem key={value} value={value}>
										{LESSON_TYPE_LABELS[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							{LESSON_TYPE_HINTS[type]}
						</p>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-minutes`}>Minutos estimados</Label>
						<Input
							id={`${id}-minutes`}
							type="number"
							inputMode="numeric"
							min={1}
							max={LESSON_MAX_ESTIMATED_MINUTES}
							placeholder="Opcional"
							value={minutes}
							onChange={(event) => setMinutes(event.target.value)}
						/>
					</div>

					<div className="flex items-center gap-2">
						<Checkbox
							id={`${id}-required`}
							checked={isRequired}
							onCheckedChange={(checked) => setIsRequired(checked === true)}
						/>
						<Label htmlFor={`${id}-required`} className="font-normal">
							Obligatoria para completar el curso
						</Label>
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
						{lesson ? "Guardar cambios" : "Crear lección"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
