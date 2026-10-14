import { ArrowRight, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

type CountTone = "neutral" | "warning";

const COUNT_TONES: Record<CountTone, string> = {
	neutral: "bg-muted text-foreground",
	warning: "bg-warning text-warning-foreground",
};

/** Una responsabilidad del panel: su título, lo que resume y adónde se trabaja. */
export function DashboardSection({
	id,
	title,
	description,
	count,
	more,
	className,
	children,
}: {
	id?: string;
	title: string;
	description?: string;
	/** Cuántos elementos hay, junto al título; el sustantivo es para el lector de pantalla. */
	count?: {
		value: number;
		noun: [string, string];
		tone?: CountTone;
		/** Hay más de los que se leyeron: se lee «6+». */
		more?: boolean;
	};
	more?: { label: string; to: string };
	className?: string;
	children: React.ReactNode;
}) {
	const headingId = useId();

	return (
		<section
			id={id}
			aria-labelledby={headingId}
			className={cn("flex scroll-mt-6 flex-col gap-4", className)}
		>
			<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex items-center gap-2.5">
						<h2 id={headingId} className="font-semibold text-lg">
							{title}
						</h2>
						{count && count.value > 0 && (
							<span
								className={cn(
									"inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-semibold text-xs tabular-nums",
									COUNT_TONES[count.tone ?? "neutral"],
								)}
							>
								{count.value}
								{count.more && "+"}
								<span className="sr-only">
									{" "}
									{count.value === 1 && !count.more
										? count.noun[0]
										: count.noun[1]}
								</span>
							</span>
						)}
					</div>
					{description && (
						<p className="text-muted-foreground text-sm">{description}</p>
					)}
				</div>
				{more && <MoreLink {...more} />}
			</div>
			{children}
		</section>
	);
}

/** «Ver todo →» hacia la pantalla donde se trabaja la lista completa. */
export function MoreLink({ label, to }: { label: string; to: string }) {
	return (
		<Link
			to={to}
			className="inline-flex items-center gap-1 rounded-md font-medium text-primary text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
		>
			{label}
			<ArrowRight className="size-3.5" aria-hidden="true" />
		</Link>
	);
}

/**
 * Una sola línea en lugar de una lista vacía: dice qué significa que no haya
 * nada y, si toca, qué hacer.
 */
export function EmptyNote({
	icon: Icon,
	tone = "neutral",
	action,
	children,
}: {
	icon: LucideIcon;
	tone?: "neutral" | "success";
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 rounded-2xl bg-card px-5 py-4 text-sm ring-1 ring-foreground/5 sm:flex-row sm:items-center sm:justify-between dark:ring-foreground/10">
			<div className="flex items-start gap-2.5 text-muted-foreground">
				<Icon
					className={cn(
						"mt-0.5 size-4 shrink-0",
						tone === "success" && "text-success-foreground",
					)}
					aria-hidden="true"
				/>
				<div className="flex flex-col gap-0.5">{children}</div>
			</div>
			{action && (
				<div className="flex shrink-0 *:w-full sm:*:w-auto">{action}</div>
			)}
		</div>
	);
}
