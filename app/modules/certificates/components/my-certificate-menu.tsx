import { Award, ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { MY_CERTIFICATES_PATH } from "../domain/certificate.config";
import { useFileDownload } from "../hooks/use-file-download";
import { myCertificateDownloadUrl } from "../utils/certificate-urls";

interface MyCertificateMenuProps {
	documentId: string;
	downloadable: boolean;
}

/**
 * El certificado propio desde la tarjeta de un curso terminado. Sin descarga,
 * lleva a «Mis certificados», donde se explica quién lo entrega.
 */
export function MyCertificateMenu({
	documentId,
	downloadable,
}: MyCertificateMenuProps) {
	const { download, pending } = useFileDownload();

	if (!downloadable) {
		return (
			<Button variant="outline" size="sm" asChild>
				<Link to={MY_CERTIFICATES_PATH}>
					<Award aria-hidden="true" />
					Certificado
				</Link>
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" disabled={pending !== null}>
					<Award aria-hidden="true" />
					{pending ? "Generando…" : "Certificado"}
					<ChevronDown aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{(["pdf", "png"] as const).map((format) => (
					<DropdownMenuItem
						key={format}
						onSelect={() =>
							download(
								myCertificateDownloadUrl(documentId, format),
								`certificado.${format}`,
							)
						}
					>
						Descargar {format.toUpperCase()}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
