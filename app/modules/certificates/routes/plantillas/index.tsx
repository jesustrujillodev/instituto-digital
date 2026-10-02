export { action } from "./index.action";
export { loader } from "./index.loader";

import { Archive, ArchiveRestore, PencilRuler, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import { PageHeader } from "@/shared/components/common/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { DesignThumbnail } from "../../components/editor/design-thumbnail";
import { toSampleRenderData } from "../../domain/certificate.mapper";
import type { CertificateTemplateView } from "../../domain/certificate.types";
import {
	CERTIFICATE_TEMPLATE,
	TEMPLATE_SAMPLE_COURSE,
} from "../../domain/certificate-template.rules";
import {
	TEMPLATE_INTENTS,
	type TemplateActionData,
	templateEditorPath,
} from "../../utils/template-form";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Plantillas de certificado" }],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta() {
	return [{ title: "Plantillas de certificado" }];
}

function CreateDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const fetcher = useFetcher<TemplateActionData>();
	useFetcherToast(fetcher);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<fetcher.Form method="post" className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>Nueva plantilla</DialogTitle>
						<DialogDescription>
							Empieza con el diseño institucional y ábrela en el editor.
						</DialogDescription>
					</DialogHeader>
					<input type="hidden" name="intent" value={TEMPLATE_INTENTS.create} />
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="template-name">Nombre</Label>
						<Input
							id="template-name"
							name="name"
							required
							maxLength={CERTIFICATE_TEMPLATE.nameMax}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="template-description">Descripción (opcional)</Label>
						<Textarea
							id="template-description"
							name="description"
							rows={3}
							maxLength={CERTIFICATE_TEMPLATE.descriptionMax}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							Cancelar
						</Button>
						<Button type="submit" pending={fetcher.state !== "idle"}>
							Crear y abrir
						</Button>
					</DialogFooter>
				</fetcher.Form>
			</DialogContent>
		</Dialog>
	);
}

function TemplateCard({
	template,
	data,
	logoUrls,
}: {
	template: CertificateTemplateView;
	data: ReturnType<typeof toSampleRenderData>;
	logoUrls: Record<string, string>;
}) {
	const fetcher = useFetcher<TemplateActionData>();
	useFetcherToast(fetcher);
	const archived = template.archivedAt !== null;

	return (
		<li className="flex flex-col overflow-hidden rounded-lg border bg-card">
			<div className={archived ? "p-3 opacity-60" : "p-3"}>
				<DesignThumbnail
					design={template.design}
					data={data}
					logoUrls={logoUrls}
					label={template.name}
				/>
			</div>
			<div className="flex flex-1 flex-col gap-2 border-t p-3">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">{template.name}</p>
						<p className="truncate text-muted-foreground text-xs">
							{template.scope === "INSTITUTIONAL"
								? "Institucional"
								: template.dependencyName}
						</p>
					</div>
					{archived && <Badge variant="outline">Archivada</Badge>}
				</div>
				{template.description && (
					<p className="line-clamp-2 text-muted-foreground text-xs">
						{template.description}
					</p>
				)}
				{template.canEdit && (
					<div className="mt-auto flex gap-2 pt-1">
						{!archived && (
							<Button variant="outline" size="sm" asChild>
								<Link to={templateEditorPath(template.documentId)}>
									<PencilRuler aria-hidden="true" />
									Editar
								</Link>
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							pending={fetcher.state !== "idle"}
							onClick={() =>
								fetcher.submit(
									{
										intent: TEMPLATE_INTENTS.archive,
										documentId: template.documentId,
										archived: String(!archived),
									},
									{ method: "post" },
								)
							}
						>
							{archived ? (
								<ArchiveRestore aria-hidden="true" />
							) : (
								<Archive aria-hidden="true" />
							)}
							{archived ? "Restaurar" : "Archivar"}
						</Button>
					</div>
				)}
			</div>
		</li>
	);
}

export default function CertificateTemplatesPage({
	loaderData,
}: Route.ComponentProps) {
	const { templates, logoUrls, canCreate, today } = loaderData.data;
	const [creating, setCreating] = useState(false);
	const data = useMemo(
		() =>
			toSampleRenderData(
				{ ...TEMPLATE_SAMPLE_COURSE },
				"{year}-{seq}",
				new Date(today),
			),
		[today],
	);

	return (
		<div className="flex flex-col gap-4 pb-10">
			<PageHeader
				title="Plantillas de certificado"
				description="Diseños listos para partir de ellos en el certificado de cualquier capacitación."
				actions={
					canCreate ? (
						<Button onClick={() => setCreating(true)}>
							<Plus aria-hidden="true" />
							Nueva plantilla
						</Button>
					) : undefined
				}
			/>
			{templates.length === 0 ? (
				<p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
					Aún no hay plantillas. También puedes guardar el certificado de una
					capacitación como plantilla desde su editor.
				</p>
			) : (
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{templates.map((template) => (
						<TemplateCard
							key={template.documentId}
							template={template}
							data={data}
							logoUrls={logoUrls}
						/>
					))}
				</ul>
			)}
			<CreateDialog open={creating} onOpenChange={setCreating} />
		</div>
	);
}
