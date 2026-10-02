import { BookmarkPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";
import type {
	CertificateDesignV2,
	CertificateRenderData,
	CertificateTemplateView,
} from "../../domain/certificate.types";
import { CERTIFICATE_TEMPLATE } from "../../domain/certificate-template.rules";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../../utils/certificate-form";
import { PropertySection } from "./fields";
import { TemplateGrid } from "./templates-panel";

interface TemplateLibraryProps {
	templates: readonly CertificateTemplateView[];
	data: CertificateRenderData;
	logoUrls: Record<string, string>;
	readOnly: boolean;
	actionPath: string;
	onApply: (design: CertificateDesignV2, name: string) => void;
}

/**
 * La biblioteca dentro del editor del curso. Aplicar una plantilla pide al
 * servidor copiar sus imágenes a la capacitación: el certificado nunca apunta
 * a la carpeta de la plantilla.
 */
export function TemplateLibrary({
	templates,
	data,
	logoUrls,
	readOnly,
	actionPath,
	onApply,
}: TemplateLibraryProps) {
	const fetcher = useFetcher<CertificateActionData>();
	useFetcherToast(fetcher);
	const chosen = useRef<string>("");
	const handled = useRef<unknown>(null);

	useEffect(() => {
		const result = fetcher.data;
		if (fetcher.state !== "idle" || !result || handled.current === result)
			return;
		handled.current = result;
		if (result.success && result.data && "applied" in result.data) {
			onApply(result.data.applied, chosen.current);
		}
	}, [fetcher.state, fetcher.data, onApply]);

	if (templates.length === 0) return null;

	return (
		<PropertySection title="Biblioteca">
			<TemplateGrid
				choices={templates.map((template) => ({
					id: template.documentId,
					name: template.name,
					design: template.design,
					documentId: template.documentId,
				}))}
				data={data}
				logoUrls={logoUrls}
				readOnly={readOnly || fetcher.state !== "idle"}
				onChoose={(choice) => {
					chosen.current = choice.name;
					fetcher.submit(
						{
							[INTENT_FIELD]: CERTIFICATE_INTENTS.applyTemplate,
							[PAYLOAD_FIELD]: JSON.stringify(choice.documentId),
						},
						{ method: "post", action: actionPath },
					);
				}}
			/>
		</PropertySection>
	);
}

/** Guarda el diseño en pantalla como plantilla de la biblioteca, sin firmas. */
export function SaveAsTemplateButton({
	design,
	actionPath,
}: {
	design: CertificateDesignV2;
	actionPath: string;
}) {
	const fetcher = useFetcher<CertificateActionData>();
	useFetcherToast(fetcher, { onSuccess: () => setOpen(false) });
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	return (
		<>
			<Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
				<BookmarkPlus aria-hidden="true" />
				<span className="hidden lg:inline">Guardar como plantilla</span>
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							fetcher.submit(
								{
									[INTENT_FIELD]: CERTIFICATE_INTENTS.saveAsTemplate,
									[PAYLOAD_FIELD]: JSON.stringify({
										name,
										description: description || null,
										design,
									}),
								},
								{ method: "post", action: actionPath },
							);
						}}
					>
						<DialogHeader>
							<DialogTitle>Guardar como plantilla</DialogTitle>
							<DialogDescription>
								Se guarda lo que está en pantalla, sin las firmas, para que
								otras capacitaciones partan de este diseño.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="save-template-name">Nombre</Label>
							<Input
								id="save-template-name"
								value={name}
								required
								maxLength={CERTIFICATE_TEMPLATE.nameMax}
								onChange={(event) => setName(event.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="save-template-description">
								Descripción (opcional)
							</Label>
							<Textarea
								id="save-template-description"
								value={description}
								rows={3}
								maxLength={CERTIFICATE_TEMPLATE.descriptionMax}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setOpen(false)}
							>
								Cancelar
							</Button>
							<Button
								type="submit"
								pending={fetcher.state !== "idle"}
								disabled={!name.trim()}
							>
								Guardar en la biblioteca
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
