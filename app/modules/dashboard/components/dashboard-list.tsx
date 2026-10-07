import { Link } from "react-router";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "warning" | "success" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
	neutral: "text-muted-foreground",
	warning: "font-medium text-warning-foreground",
	success: "font-medium text-success-foreground",
	muted: "text-muted-foreground",
};

/** Lista de renglones separados por un filete tenue, sin tarjetas anidadas. */
export function DashboardList({
	label,
	className,
	children,
}: {
	label?: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<ul aria-label={label} className={cn("flex flex-col divide-y", className)}>
			{children}
		</ul>
	);
}

/**
 * Un renglón: qué es, por qué importa y una acción con verbo. En móvil la
 * acción baja debajo del texto a todo el ancho.
 */
export function DashboardListItem({
	leading,
	title,
	href,
	meta,
	note,
	tone = "neutral",
	action,
	children,
}: {
	leading?: React.ReactNode;
	title: string;
	href?: string;
	meta?: React.ReactNode;
	note?: React.ReactNode;
	tone?: Tone;
	action?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
			<div className="flex min-w-0 flex-1 items-start gap-3">
				{leading}
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					{href ? (
						<Link
							to={href}
							className="line-clamp-2 rounded-sm font-medium text-foreground text-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
						>
							{title}
						</Link>
					) : (
						<p className="line-clamp-2 font-medium text-foreground text-sm">
							{title}
						</p>
					)}
					{meta && (
						<p className="text-muted-foreground text-xs tabular-nums">{meta}</p>
					)}
					{note && (
						<p className={cn("text-xs tabular-nums", TONE_CLASSES[tone])}>
							{note}
						</p>
					)}
					{children}
				</div>
			</div>
			{action && (
				<div className="flex shrink-0 *:w-full sm:*:w-auto">{action}</div>
			)}
		</li>
	);
}

/** «y N más →» al pie de una lista recortada. */
export function OverflowLink({ count, to }: { count: number; to: string }) {
	if (count <= 0) return null;

	return (
		<Link
			to={to}
			className="self-start rounded-sm text-muted-foreground text-xs underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
		>
			y {count} más →
		</Link>
	);
}
