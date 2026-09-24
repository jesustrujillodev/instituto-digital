export { loader } from "./index.loader";

import {
	Building2,
	CalendarDays,
	Clock,
	Download,
	ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import type { MyCertificate } from "../../domain/certificate.types";
import { useFileDownload } from "../../hooks/use-file-download";
import { myCertificateDownloadUrl } from "../../utils/certificate-urls";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Mis certificados" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Mis certificados" }];
}

function CertificateRow({
	certificate,
	download,
	pending,
}: {
	certificate: MyCertificate;
	download: ReturnType<typeof useFileDownload>["download"];
	pending: string | null;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<h2 className="font-medium">{certificate.courseTitle}</h2>
					<ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
						<li className="flex items-center gap-1">
							<Building2 className="size-3.5" aria-hidden="true" />
							{certificate.dependencyName}
						</li>
						<li className="flex items-center gap-1">
							<CalendarDays className="size-3.5" aria-hidden="true" />
							{certificate.issuedOn}
						</li>
						{certificate.hours && (
							<li className="flex items-center gap-1">
								<Clock className="size-3.5" aria-hidden="true" />
								{certificate.hours}
							</li>
						)}
						<li className="tabular-nums">Folio {certificate.folio}</li>
					</ul>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{certificate.downloadable ? (
						(["pdf", "png"] as const).map((format) => {
							const url = myCertificateDownloadUrl(
								certificate.documentId,
								format,
							);
							return (
								<Button
									key={format}
									variant="outline"
									size="sm"
									disabled={pending !== null}
									onClick={() => download(url, `certificado.${format}`)}
								>
									<Download aria-hidden="true" />
									{pending === url ? "Generando…" : format.toUpperCase()}
								</Button>
							);
						})
					) : (
						<p className="text-muted-foreground text-xs">
							La dependencia organizadora te lo entregará.
						</p>
					)}
					<Button variant="ghost" size="sm" asChild>
						<a
							href={certificate.verificationPath}
							target="_blank"
							rel="noreferrer"
						>
							<ShieldCheck aria-hidden="true" />
							Verificar
						</a>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export default function MisCertificadosPage({
	loaderData,
}: Route.ComponentProps) {
	const { certificates } = loaderData.data;
	const { download, pending } = useFileDownload();

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Mis certificados"
				description="Los certificados de los cursos que completaste. Cualquiera puede comprobarlos con el QR impreso o con «Verificar»."
			/>

			{certificates.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Todavía no tienes certificados</EmptyTitle>
						<EmptyDescription>
							Aparecen aquí cuando completas un curso.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				certificates.map((certificate) => (
					<CertificateRow
						key={certificate.documentId}
						certificate={certificate}
						download={download}
						pending={pending}
					/>
				))
			)}
		</div>
	);
}
