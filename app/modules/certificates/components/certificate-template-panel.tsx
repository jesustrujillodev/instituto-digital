import { cn } from "@/lib/utils";
import {
	CERTIFICATE_TEMPLATE_IDS,
	type CertificateTemplateId,
	safeAccent,
} from "../domain/certificate.rules";
import { TEMPLATE_LABELS } from "../utils/certificate-labels";

/**
 * La silueta de cada plantilla, en CSS: tres certificados reales escalados
 * serían tres iframes más por un dibujo que solo tiene que distinguirse.
 */
function TemplateThumb({
	templateId,
	accent,
}: {
	templateId: CertificateTemplateId;
	accent: string;
}) {
	const line = "h-1 rounded-full bg-foreground/15";

	return (
		<div className="relative aspect-[1100/780] w-full overflow-hidden rounded-md bg-white ring-1 ring-foreground/10">
			{templateId === "institucional" && (
				<>
					<div className="h-[18%]" style={{ background: accent }} />
					<div className="flex flex-col items-center gap-1.5 px-[18%] pt-[10%]">
						<div className="h-2 w-3/4 rounded-full bg-foreground/30" />
						<div className="h-0.5 w-4/5" style={{ background: accent }} />
						<div className={cn(line, "w-1/2")} />
					</div>
				</>
			)}
			{templateId === "minima" && (
				<div className="flex h-full">
					<div className="w-[21%]" style={{ background: accent }} />
					<div className="flex flex-1 flex-col gap-1.5 p-[8%]">
						<div className="h-2 w-4/5 rounded-full bg-foreground/30" />
						<div className={cn(line, "w-3/5")} />
						<div className="h-0.5 w-full" style={{ background: accent }} />
					</div>
				</div>
			)}
			{templateId === "marco" && (
				<div className="h-full p-[4%]" style={{ background: accent }}>
					<div className="flex h-full flex-col items-center gap-1.5 bg-white pt-[8%]">
						<div
							className="h-2.5 w-1/4 rounded-full"
							style={{ background: accent }}
						/>
						<div className="h-2 w-2/3 rounded-full bg-foreground/30" />
						<div className={cn(line, "w-1/2")} />
					</div>
				</div>
			)}
		</div>
	);
}

export function CertificateTemplatePanel({
	value,
	accent,
	disabled,
	onChange,
}: {
	value: CertificateTemplateId;
	accent: string;
	disabled: boolean;
	onChange: (templateId: CertificateTemplateId) => void;
}) {
	const color = safeAccent(accent);

	return (
		<fieldset className="grid grid-cols-2 gap-3">
			<legend className="sr-only">Plantilla</legend>
			{CERTIFICATE_TEMPLATE_IDS.map((templateId) => {
				const selected = templateId === value;
				const { label, description } = TEMPLATE_LABELS[templateId];

				return (
					<button
						key={templateId}
						type="button"
						aria-pressed={selected}
						disabled={disabled}
						onClick={() => onChange(templateId)}
						className={cn(
							"flex flex-col gap-2 rounded-lg border p-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60",
							selected
								? "border-primary bg-primary/5"
								: "hover:border-foreground/30",
						)}
					>
						<TemplateThumb templateId={templateId} accent={color} />
						<span className="font-medium text-sm">{label}</span>
						<span className="text-muted-foreground text-xs">{description}</span>
					</button>
				);
			})}
		</fieldset>
	);
}
