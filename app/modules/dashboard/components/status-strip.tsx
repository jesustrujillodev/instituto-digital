import { cn } from "@/lib/utils";
import { MoreLink } from "./dashboard-section";

export type StripTone = "ok" | "warning" | "danger";

const STRIP_DOT: Record<StripTone, string> = {
	ok: "bg-success-foreground",
	warning: "bg-warning-foreground",
	danger: "bg-destructive",
};

/**
 * Una línea bajo el encabezado: cómo está todo y los datos que lo explican.
 * Resume; lo que hay que hacer va en «Requiere tu atención».
 */
export function StatusStrip({
	label,
	tone,
	status,
	facts,
	link,
}: {
	label: string;
	tone: StripTone;
	status: string;
	facts: string[];
	link: { label: string; to: string };
}) {
	return (
		<section
			aria-label={label}
			className="flex flex-col gap-x-6 gap-y-2 rounded-2xl bg-card px-5 py-3.5 text-sm shadow-xs ring-1 ring-foreground/5 sm:flex-row sm:items-center sm:justify-between dark:ring-foreground/10"
		>
			<p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
				<span className="flex items-center gap-2.5 font-medium text-foreground">
					<span
						className={cn("size-2 shrink-0 rounded-full", STRIP_DOT[tone])}
						aria-hidden="true"
					/>
					{status}
				</span>
				{facts.map((fact) => (
					<span key={fact} className="text-muted-foreground tabular-nums">
						<span aria-hidden="true">· </span>
						{fact}
					</span>
				))}
			</p>
			<div className="shrink-0">
				<MoreLink {...link} />
			</div>
		</section>
	);
}
