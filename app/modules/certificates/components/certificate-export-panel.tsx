import { Download } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type {
	CertificateExportFormat,
	SampleVersion,
} from "../domain/certificate.types";
import { useFileDownload } from "../hooks/use-file-download";
import { certificateSampleUrl } from "../utils/certificate-urls";

interface CertificateExportPanelProps {
	courseDocumentId: string;
	hasPublished: boolean;
	/** Con cambios sin guardar, lo que se exporta no es lo que se ve. */
	isDirty: boolean;
}

const FORMATS: { format: CertificateExportFormat; label: string }[] = [
	{ format: "pdf", label: "PDF" },
	{ format: "png", label: "PNG" },
];

/**
 * El certificado guardado, con datos de muestra, en el archivo real que sale al
 * emitir: sirve para revisarlo impreso antes de publicarlo.
 */
export function CertificateExportPanel({
	courseDocumentId,
	hasPublished,
	isDirty,
}: CertificateExportPanelProps) {
	const { download, pending } = useFileDownload();

	const row = (version: SampleVersion, title: string, hint: string) => (
		<div className="flex flex-col gap-2 rounded-md border p-3">
			<div>
				<p className="font-medium text-sm">{title}</p>
				<p className="text-muted-foreground text-xs">{hint}</p>
			</div>
			<div className="flex gap-2">
				{FORMATS.map(({ format, label }) => {
					const url = certificateSampleUrl(courseDocumentId, version, format);
					return (
						<Button
							key={format}
							variant="outline"
							size="sm"
							disabled={pending !== null || (version === "draft" && isDirty)}
							onClick={() => download(url, `certificado-muestra.${format}`)}
						>
							<Download aria-hidden="true" />
							{pending === url ? "Generando…" : label}
						</Button>
					);
				})}
			</div>
		</div>
	);

	return (
		<div className="flex flex-col gap-3">
			{row(
				"draft",
				"Lo guardado",
				isDirty
					? "Guarda antes de exportar: lo que no se guardó no sale en el archivo."
					: "El diseño tal como está guardado ahora.",
			)}
			{hasPublished &&
				row(
					"published",
					"Lo publicado",
					"Con lo que se emiten los certificados.",
				)}
			<p className="text-muted-foreground text-xs">
				Lleva una persona de muestra y el primer folio. El PNG sale al doble de
				tamaño para que se imprima nítido.
			</p>
		</div>
	);
}
