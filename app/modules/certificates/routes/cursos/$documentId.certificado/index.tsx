export { action } from "./index.action";
export { loader } from "./index.loader";

import { PencilRuler, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import { pendingIntentOf } from "@/lib/form-data";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CertificateDeliveryPanel } from "../../../components/certificate-delivery-panel";
import { CertificateExportPanel } from "../../../components/certificate-export-panel";
import { CertificatePreview } from "../../../components/certificate-preview";
import { toSampleRenderData } from "../../../domain/certificate.mapper";
import { isDesignV2 } from "../../../domain/design/design.schema";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	certificateEditorPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../../../utils/certificate-form";
import { STATE_LABELS } from "../../../utils/certificate-labels";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/capacitaciones";

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Capacitaciones", path: LIST_PATH },
		loaderData
			? {
					label: loaderData.data.editor.course.title,
					path: `${LIST_PATH}/${loaderData.data.editor.course.documentId}`,
				}
			: { label: "Capacitación" },
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
		data: { editor, logoUrls, canEdit, today },
	} = loaderData;
	const { course, record, state, delivery } = editor;

	const fetcher = useFetcher<CertificateActionData>();
	useFetcherToast(fetcher);
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);
	const busy = fetcher.state !== "idle";
	const pendingIntent = pendingIntentOf(fetcher, INTENT_FIELD);

	const sampleData = useMemo(
		() => toSampleRenderData(course, record.draft.folioFormat, new Date(today)),
		[course, record.draft.folioFormat, today],
	);

	// Un borrador del gestor anterior se publica desde el editor, después de
	// revisar su conversión: aquí no se publica a ciegas.
	const draftIsV2 = isDesignV2(record.draft);
	const label = STATE_LABELS[state];

	const actions = (
		<>
			{canEdit && record.published && state === "unpublished-changes" && (
				<Button
					variant="ghost"
					disabled={busy}
					onClick={() => setConfirmingDiscard(true)}
				>
					<RotateCcw aria-hidden="true" />
					Descartar cambios
				</Button>
			)}
			{canEdit && draftIsV2 && state !== "published" && (
				<Button
					variant="outline"
					disabled={busy}
					pending={pendingIntent === CERTIFICATE_INTENTS.publish}
					onClick={() =>
						fetcher.submit(
							{
								[INTENT_FIELD]: CERTIFICATE_INTENTS.publish,
								[PAYLOAD_FIELD]: JSON.stringify(record.draft),
							},
							{ method: "post" },
						)
					}
				>
					<Send aria-hidden="true" />
					Publicar lo guardado
				</Button>
			)}
			<Button asChild>
				<Link to={certificateEditorPath(course.documentId)}>
					<PencilRuler aria-hidden="true" />
					{canEdit ? "Abrir editor" : "Ver en el editor"}
				</Link>
			</Button>
		</>
	);

	return (
		<div className="flex flex-col gap-4 pb-10">
			<PageHeader
				title="Certificado"
				description={course.title}
				goBack={`${LIST_PATH}/${course.documentId}`}
				actions={actions}
			/>

			<div className="flex flex-wrap items-center gap-2 text-sm">
				<Badge variant={state === "published" ? "default" : "outline"}>
					{label.label}
				</Badge>
				<span className="text-muted-foreground">{label.hint}</span>
			</div>

			{/* Mientras no haya publicado, la emisión usa el diseño por defecto: es el
			    malentendido que dejaba cursos certificando con otro diseño. */}
			{canEdit && state === "never-published" && (
				<Alert className="border-warning-foreground/25 bg-warning">
					<TriangleAlert
						aria-hidden="true"
						className="text-warning-foreground"
					/>
					<AlertTitle>Este certificado aún no está publicado</AlertTitle>
					<AlertDescription>
						Los certificados que se emitan ahora usarán el diseño por defecto,
						no este. Publícalo para que se emita con él; lo ya emitido no
						cambia.
					</AlertDescription>
				</Alert>
			)}

			{canEdit && !draftIsV2 && (
				<Alert>
					<AlertTitle>Hecho con el gestor de plantillas</AlertTitle>
					<AlertDescription>
						Ábrelo en el editor para pasarlo al editor libre. Se sigue emitiendo
						con lo publicado hasta que publiques la nueva versión.
					</AlertDescription>
				</Alert>
			)}

			{!canEdit && (
				<Alert>
					<AlertDescription>
						La capacitación está cancelada: su certificado ya no se puede
						cambiar.
					</AlertDescription>
				</Alert>
			)}

			<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
				<div className="flex flex-col gap-2">
					<CertificatePreview
						design={record.draft}
						data={sampleData}
						logoUrls={logoUrls}
					/>
					<p className="text-muted-foreground text-xs">
						El borrador guardado, con una persona de muestra y el primer folio.
						Al emitirse lleva el nombre de cada participante.
					</p>
				</div>
				<div className="flex flex-col gap-4">
					<div className="rounded-lg border bg-card p-4">
						<h2 className="mb-3 font-medium text-sm">Exportar muestra</h2>
						<CertificateExportPanel
							courseDocumentId={course.documentId}
							hasPublished={record.published !== null}
							isDirty={false}
						/>
					</div>
					<div className="rounded-lg border bg-card p-4">
						<h2 className="mb-3 font-medium text-sm">Entrega</h2>
						<CertificateDeliveryPanel
							key={JSON.stringify(delivery)}
							delivery={delivery}
							disabled={!canEdit}
						/>
					</div>
				</div>
			</div>

			<ConfirmDialog
				open={confirmingDiscard}
				onOpenChange={setConfirmingDiscard}
				title="¿Descartar los cambios sin publicar?"
				description="El borrador vuelve a ser el certificado publicado. Lo que cambiaste después se pierde."
				confirmLabel="Descartar cambios"
				cancelLabel="Volver"
				destructive
				onConfirm={() => {
					fetcher.submit(
						{ [INTENT_FIELD]: CERTIFICATE_INTENTS.discard },
						{ method: "post" },
					);
					setConfirmingDiscard(false);
				}}
			/>
		</div>
	);
}
