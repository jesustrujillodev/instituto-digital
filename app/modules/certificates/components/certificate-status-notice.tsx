import { ArrowRight, Award, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import type { CertificateState } from "../domain/certificate.rules";
import { certificateEditorPath } from "../utils/certificate-urls";

interface CertificateStatusNoticeProps {
	courseDocumentId: string;
	state: CertificateState;
}

const NOTICES: Record<
	Exclude<CertificateState, "published">,
	{ title: string; body: string; action: string }
> = {
	"never-published": {
		title: "Certificado sin publicar",
		body: "Mientras no lo publiques, quien complete el curso recibe el diseño por defecto.",
		action: "Diseñar y publicar",
	},
	"unpublished-changes": {
		title: "Certificado con cambios sin publicar",
		body: "Se sigue emitiendo con el diseño publicado hasta que publiques los cambios.",
		action: "Revisar y publicar",
	},
};

/**
 * El estado del certificado en la ficha del curso, solo cuando pide algo.
 *
 * Publicado no dice nada: el botón «Certificado» del encabezado basta. Sin
 * publicar se marca como aviso, porque es lo que hace que un curso emita un
 * diseño que nadie eligió.
 */
export function CertificateStatusNotice({
	courseDocumentId,
	state,
}: CertificateStatusNoticeProps) {
	if (state === "published") return null;

	const notice = NOTICES[state];
	const isWarning = state === "never-published";
	const Icon = isWarning ? TriangleAlert : Award;

	return (
		<section
			className={cn(
				"flex flex-col gap-3 rounded-2xl border p-4 text-sm",
				isWarning
					? "border-warning-foreground/25 bg-warning"
					: "border-border bg-card",
			)}
		>
			<div className="flex items-start gap-2.5">
				<Icon
					aria-hidden="true"
					className={cn(
						"mt-0.5 size-4 shrink-0",
						isWarning ? "text-warning-foreground" : "text-muted-foreground",
					)}
				/>
				<div className="flex flex-col gap-0.5">
					<h2 className="font-medium text-foreground">{notice.title}</h2>
					<p className="text-muted-foreground">{notice.body}</p>
				</div>
			</div>
			<Button asChild variant="outline" size="sm" className="self-start">
				<Link to={certificateEditorPath(courseDocumentId)}>
					{notice.action}
					<ArrowRight aria-hidden="true" />
				</Link>
			</Button>
		</section>
	);
}
