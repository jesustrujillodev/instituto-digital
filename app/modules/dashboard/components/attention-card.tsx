import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";

export type AttentionTone = "warning" | "danger";

const SURFACE: Record<AttentionTone, string> = {
	warning: "bg-warning/50 ring-warning-foreground/20",
	danger: "bg-destructive/8 ring-destructive/25",
};

const ICON: Record<AttentionTone, string> = {
	warning: "bg-warning-foreground/12 text-warning-foreground",
	danger: "bg-destructive/12 text-destructive",
};

export function AttentionChip({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex h-5 items-center rounded-lg bg-warning-foreground/12 px-2 font-medium text-warning-foreground text-xs">
			{children}
		</span>
	);
}

/** Un pendiente: qué es, por qué importa y un solo botón con verbo. */
export function AttentionCard({
	tone = "warning",
	icon: Icon,
	title,
	titleHref,
	chips,
	description,
	action,
}: {
	tone?: AttentionTone;
	icon: LucideIcon;
	title: string;
	titleHref?: string;
	chips?: React.ReactNode;
	description: React.ReactNode;
	action: { label: string; to: string };
}) {
	return (
		<li
			className={cn(
				"flex flex-col gap-4 rounded-2xl p-4 ring-1 sm:flex-row sm:items-center sm:gap-5 sm:p-5",
				SURFACE[tone],
			)}
		>
			<div className="flex min-w-0 flex-1 items-start gap-4">
				<span
					className={cn(
						"flex size-11 shrink-0 items-center justify-center rounded-xl",
						ICON[tone],
					)}
				>
					<Icon className="size-5" aria-hidden="true" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<h3 className="font-semibold text-foreground text-sm">
							{titleHref ? (
								<Link
									to={titleHref}
									className="rounded-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
								>
									{title}
								</Link>
							) : (
								title
							)}
						</h3>
						{chips}
					</div>
					<p className="text-pretty text-muted-foreground text-sm">
						{description}
					</p>
				</div>
			</div>
			<Button asChild className="w-full sm:w-auto">
				<Link to={action.to}>{action.label}</Link>
			</Button>
		</li>
	);
}

/** La lista de tarjetas de «Requiere tu atención». */
export function AttentionList({ children }: { children: React.ReactNode }) {
	return <ul className="flex flex-col gap-3">{children}</ul>;
}
