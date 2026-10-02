export { action } from "./index.action";
export { loader } from "./index.loader";

import { Info, TriangleAlert } from "lucide-react";
import { useCallback } from "react";
import { Badge } from "@/ui/badge";
import { CertificateEditor } from "../../../components/editor/certificate-editor";
import { StartDialog } from "../../../components/editor/start-dialog";
import {
	SaveAsTemplateButton,
	TemplateLibrary,
} from "../../../components/editor/template-library";
import { toSampleRenderData } from "../../../domain/certificate.mapper";
import { designsEqual } from "../../../domain/certificate.rules";
import type { CertificateDesignV2 } from "../../../domain/design/design-v2.schema";
import {
	certificateEditorPath,
	certificatePath,
} from "../../../utils/certificate-form";
import { STATE_LABELS } from "../../../utils/certificate-labels";
import type { Route } from "./+types/index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: data
				? `Editor del certificado · ${data.data.editor.course.title}`
				: "Editor del certificado",
		},
	];
}

function Notice({
	tone,
	children,
}: {
	tone: "warning" | "info";
	children: React.ReactNode;
}) {
	const Icon = tone === "warning" ? TriangleAlert : Info;
	return (
		<p
			className={
				tone === "warning"
					? "flex items-center justify-center gap-2 border-b bg-warning px-4 py-1.5 text-warning-foreground text-xs"
					: "flex items-center justify-center gap-2 border-b bg-muted px-4 py-1.5 text-muted-foreground text-xs"
			}
		>
			<Icon className="size-3.5 shrink-0" aria-hidden="true" />
			{children}
		</p>
	);
}

export default function CertificateEditorPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: {
			editor,
			logos,
			templates,
			canCreateTemplates,
			design,
			migrated,
			canEdit,
			today,
		},
	} = loaderData;
	const { course, record, state } = editor;

	const sampleData = useCallback(
		(folioFormat: string) =>
			toSampleRenderData(course, folioFormat, new Date(today)),
		[course, today],
	);
	const isPublished = useCallback(
		(current: CertificateDesignV2) =>
			record.published !== null && designsEqual(current, record.published),
		[record.published],
	);

	const label = STATE_LABELS[state];
	const actionPath = certificateEditorPath(course.documentId);

	return (
		<CertificateEditor
			// Un guardado que cambia el diseño del servidor no reinicia el editor
			// (ni su historial): solo un cambio de curso lo hace.
			key={course.documentId}
			title={course.title}
			subtitle="Certificado de la capacitación"
			backHref={certificatePath(course.documentId)}
			initialDesign={design}
			sampleData={sampleData}
			logos={logos}
			readOnly={!canEdit}
			actionPath={actionPath}
			canPublish
			library={({ data, logoUrls, apply }) => (
				<TemplateLibrary
					templates={templates}
					data={data}
					logoUrls={logoUrls}
					readOnly={!canEdit}
					actionPath={actionPath}
					onApply={apply}
				/>
			)}
			// Sin fila de certificado todavía: se elige cómo empezar.
			start={
				!record.exists && canEdit
					? (context) => (
							<StartDialog
								{...context}
								templates={templates}
								actionPath={actionPath}
							/>
						)
					: undefined
			}
			headerActions={(current) =>
				canCreateTemplates && canEdit ? (
					<SaveAsTemplateButton design={current} actionPath={actionPath} />
				) : null
			}
			isPublished={isPublished}
			convertedFromV1={migrated}
			status={
				<Badge
					variant={state === "published" ? "default" : "outline"}
					title={label.hint}
				>
					{label.label}
				</Badge>
			}
			notice={
				<>
					{!canEdit && (
						<Notice tone="info">
							La capacitación está cancelada: su certificado ya no se puede
							cambiar.
						</Notice>
					)}
					{migrated && (
						<Notice tone="warning">
							Este certificado venía del gestor de plantillas y se convirtió al
							editor libre. Revísalo antes de publicar: lo emitido hasta hoy no
							cambia.
						</Notice>
					)}
					{!migrated && canEdit && state === "never-published" && (
						<Notice tone="warning">
							Aún no está publicado: lo que se emita ahora usa el diseño por
							defecto. Publícalo para que se emita con este.
						</Notice>
					)}
				</>
			}
		/>
	);
}
