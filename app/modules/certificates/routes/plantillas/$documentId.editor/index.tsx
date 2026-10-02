export { action } from "./index.action";
export { loader } from "./index.loader";

import { Info } from "lucide-react";
import { useCallback } from "react";
import { Badge } from "@/ui/badge";
import { CertificateEditor } from "../../../components/editor/certificate-editor";
import { toSampleRenderData } from "../../../domain/certificate.mapper";
import { TEMPLATE_SAMPLE_COURSE } from "../../../domain/certificate-template.rules";
import {
	TEMPLATES_PATH,
	templateEditorPath,
} from "../../../utils/template-form";
import type { Route } from "./+types/index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: data ? `Plantilla · ${data.data.template.name}` : "Plantilla" },
	];
}

const never = () => false;

export default function TemplateEditorPage({
	loaderData,
}: Route.ComponentProps) {
	const { template, logos, today } = loaderData.data;

	const sampleData = useCallback(
		(folioFormat: string) =>
			toSampleRenderData(
				{ ...TEMPLATE_SAMPLE_COURSE },
				folioFormat,
				new Date(today),
			),
		[today],
	);

	return (
		<CertificateEditor
			key={template.documentId}
			title={template.name}
			subtitle="Plantilla de certificado"
			backHref={TEMPLATES_PATH}
			initialDesign={template.design}
			sampleData={sampleData}
			logos={logos}
			readOnly={!template.canEdit}
			actionPath={templateEditorPath(template.documentId)}
			canPublish={false}
			isPublished={never}
			status={
				<Badge variant="outline">
					{template.scope === "INSTITUTIONAL"
						? "Institucional"
						: template.dependencyName}
				</Badge>
			}
			notice={
				<p className="flex items-center justify-center gap-2 border-b bg-muted px-4 py-1.5 text-muted-foreground text-xs">
					<Info className="size-3.5 shrink-0" aria-hidden="true" />
					{template.canEdit
						? "Las firmas no se guardan en una plantilla: cada capacitación pone las suyas."
						: "Solo lectura: esta plantilla la administra otra área."}
				</p>
			}
		/>
	);
}
