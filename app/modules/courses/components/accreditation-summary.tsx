import { Award } from "lucide-react";

/**
 * «Así se acredita»: la misma lista en el alta y en la impartición, para que
 * quien crea la capacitación y quien la imparte lean el mismo criterio.
 */
export function AccreditationSummary({ steps }: { steps: readonly string[] }) {
	return (
		<section className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-4">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success text-success-foreground">
				<Award className="size-4" aria-hidden="true" />
			</span>
			<div className="flex min-w-0 flex-col gap-1.5">
				<h3 className="font-semibold text-sm">Así se acredita</h3>
				<ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
					{steps.map((step) => (
						<li key={step}>{step}</li>
					))}
				</ol>
			</div>
		</section>
	);
}
