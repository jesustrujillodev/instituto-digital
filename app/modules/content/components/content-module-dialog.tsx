import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
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
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import {
	CONTENT_DESCRIPTION_MAX_LENGTH,
	CONTENT_TITLE_MAX_LENGTH,
} from "../domain/content.config";
import type { ContentModule } from "../domain/content.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	contentPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/content-form";

/** Alta y edición de un módulo: su nombre y, si ayuda, una descripción. */
export function ContentModuleDialog({
	open,
	onOpenChange,
	courseDocumentId,
	module,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	courseDocumentId: string;
	/** `null` para un módulo nuevo. */
	module: ContentModule | null;
}) {
	const fetcher = useFetcher<ContentActionData>();
	// Una vez por respuesta: un efecto sobre `fetcher.data` volvería a cerrar el
	// diálogo al reabrirlo, porque el éxito anterior sigue ahí.
	useFetcherToast(fetcher, { onSuccess: () => onOpenChange(false) });
	const id = useId();

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");

	useEffect(() => {
		if (!open) return;
		setTitle(module?.title ?? "");
		setDescription(module?.description ?? "");
	}, [open, module]);

	const busy = fetcher.state !== "idle";

	const submit = () => {
		const shared = { title, description };

		fetcher.submit(
			{
				[INTENT_FIELD]: module
					? CONTENT_INTENTS.updateModule
					: CONTENT_INTENTS.createModule,
				[PAYLOAD_FIELD]: JSON.stringify(
					module ? { moduleDocumentId: module.documentId, ...shared } : shared,
				),
			},
			{ method: "post", action: contentPath(courseDocumentId) },
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{module ? "Editar módulo" : "Nuevo módulo"}</DialogTitle>
				</DialogHeader>

				<form
					id={`${id}-form`}
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						// React propaga por su árbol aunque Radix portale el diálogo fuera
						// del DOM: sin esto el envío llega al formulario del wizard, que
						// monta este panel y avanzaría de paso.
						event.stopPropagation();
						submit();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-title`}>Nombre</Label>
						<Input
							id={`${id}-title`}
							placeholder="Fundamentos, práctica guiada…"
							maxLength={CONTENT_TITLE_MAX_LENGTH}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-description`}>Descripción</Label>
						<Textarea
							id={`${id}-description`}
							placeholder="Opcional: qué se cubre en este módulo."
							maxLength={CONTENT_DESCRIPTION_MAX_LENGTH}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
						/>
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
						{module ? "Guardar cambios" : "Crear módulo"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
