export { action } from "./index.action";
export { loader } from "./index.loader";

import { RotateCcw, Save, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CertificateColorPanel } from "../../../components/certificate-color-panel";
import { CertificateContentPanel } from "../../../components/certificate-content-panel";
import { CertificateExportPanel } from "../../../components/certificate-export-panel";
import { CertificatePreview } from "../../../components/certificate-preview";
import { CertificateSignaturesPanel } from "../../../components/certificate-signatures-panel";
import { CertificateTemplatePanel } from "../../../components/certificate-template-panel";
import { toSampleRenderData } from "../../../domain/certificate.mapper";
import { useCertificateDraft } from "../../../hooks/use-certificate-draft";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../../../utils/certificate-form";
import { STATE_LABELS } from "../../../utils/certificate-labels";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/cursos";

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Cursos", path: LIST_PATH },
		loaderData
			? {
					label: loaderData.data.editor.course.title,
					path: `${LIST_PATH}/${loaderData.data.editor.course.documentId}`,
				}
			: { label: "Curso" },
		{ label: "Certificado" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: data
				? `Certificado · ${data.data.editor.course.title}`
				: "Certificado",
		},
	];
}

export default function CursoCertificadoPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { editor, canEdit, today },
	} = loaderData;
	const { course, record, state } = editor;

	const draft = useCertificateDraft(record.draft);
	const fetcher = useFetcher<CertificateActionData>();
	useFetcherToast(fetcher);
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);

	const busy = fetcher.state !== "idle";
	const disabled = !canEdit || busy;

	// Del diseño, solo el folio cambia los datos de muestra: depender del
	// borrador entero regeneraría la vista previa dos veces por tecla.
	const { folioFormat } = draft.draft;
	const sampleData = useMemo(
		() => toSampleRenderData(course, folioFormat, new Date(today)),
		[course, folioFormat, today],
	);

	const submit = (intent: string, fields: Record<string, string> = {}) =>
		fetcher.submit({ [INTENT_FIELD]: intent, ...fields }, { method: "post" });

	const save = () =>
		submit(CERTIFICATE_INTENTS.saveDraft, {
			[PAYLOAD_FIELD]: JSON.stringify(draft.draft),
		});

	const shownState = draft.isDirty ? null : STATE_LABELS[state];

	const actions = canEdit && (
		<>
			{record.published && state === "unpublished-changes" && (
				<Button
					variant="ghost"
					disabled={busy}
					onClick={() => setConfirmingDiscard(true)}
				>
					<RotateCcw aria-hidden="true" />
					Descartar cambios
				</Button>
			)}
			<Button
				variant="outline"
				disabled={!draft.isDirty || !draft.isValid || busy}
				onClick={save}
			>
				<Save aria-hidden="true" />
				Guardar
			</Button>
			<Button
				disabled={draft.isDirty || state === "published" || busy}
				title={draft.isDirty ? "Guarda antes de publicar" : undefined}
				onClick={() => submit(CERTIFICATE_INTENTS.publish)}
			>
				<Send aria-hidden="true" />
				Publicar
			</Button>
		</>
	);

	return (
		<div className="flex flex-col gap-4 pb-10">
			<PageHeader
				title="Certificado"
				description={course.title}
				goBack={`${LIST_PATH}/${course.documentId}`}
				actions={actions || undefined}
			/>

			<div className="flex flex-wrap items-center gap-2 text-sm">
				{shownState ? (
					<>
						<Badge variant={state === "published" ? "default" : "outline"}>
							{shownState.label}
						</Badge>
						<span className="text-muted-foreground">{shownState.hint}</span>
					</>
				) : (
					<>
						<Badge variant="secondary">Sin guardar</Badge>
						<span className="text-muted-foreground">
							{draft.isValid
								? "Guarda para no perder estos cambios; publicar va después."
								: "Revisa los campos marcados antes de guardar."}
						</span>
					</>
				)}
			</div>

			{!canEdit && (
				<Alert>
					<AlertDescription>
						El curso está cancelado: su certificado ya no se puede cambiar.
					</AlertDescription>
				</Alert>
			)}

			<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
				<div className="flex flex-col gap-4">
					<div className="rounded-lg border bg-card p-4">
						<Tabs defaultValue="template">
							<TabsList className="w-full">
								<TabsTrigger value="template">Plantilla</TabsTrigger>
								<TabsTrigger value="content">Contenido</TabsTrigger>
								<TabsTrigger value="color">Color</TabsTrigger>
								<TabsTrigger value="signatures">Firmas</TabsTrigger>
							</TabsList>
							<TabsContent value="template" className="pt-4">
								<CertificateTemplatePanel
									value={draft.draft.templateId}
									accent={draft.draft.accentColor}
									disabled={disabled}
									onChange={(templateId) => draft.update({ templateId })}
								/>
							</TabsContent>
							<TabsContent value="content" className="pt-4">
								<CertificateContentPanel
									draft={draft}
									courseDescription={course.description}
									sampleFolio={sampleData.folio}
									disabled={disabled}
								/>
							</TabsContent>
							<TabsContent value="color" className="pt-4">
								<CertificateColorPanel
									value={draft.draft.accentColor}
									error={draft.errors.accentColor}
									disabled={disabled}
									onChange={(accentColor) => draft.update({ accentColor })}
								/>
							</TabsContent>
							<TabsContent value="signatures" className="pt-4">
								<CertificateSignaturesPanel draft={draft} disabled={disabled} />
							</TabsContent>
						</Tabs>
					</div>
					<div className="rounded-lg border bg-card p-4">
						<h2 className="mb-3 font-medium text-sm">Exportar muestra</h2>
						<CertificateExportPanel
							courseDocumentId={course.documentId}
							hasPublished={record.published !== null}
							isDirty={draft.isDirty}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-2 xl:sticky xl:top-20">
					<CertificatePreview design={draft.draft} data={sampleData} />
					<p className="text-muted-foreground text-xs">
						Vista previa con una persona de muestra y el primer folio. Al
						emitirse lleva el nombre de cada participante.
					</p>
				</div>
			</div>

			<UnsavedChangesDialog when={draft.isDirty && !busy} />

			<ConfirmDialog
				open={confirmingDiscard}
				onOpenChange={setConfirmingDiscard}
				title="¿Descartar los cambios sin publicar?"
				description="El borrador vuelve a ser el certificado publicado. Lo que cambiaste después se pierde."
				confirmLabel="Descartar cambios"
				cancelLabel="Volver"
				destructive
				onConfirm={() => {
					submit(CERTIFICATE_INTENTS.discard);
					setConfirmingDiscard(false);
				}}
			/>
		</div>
	);
}
