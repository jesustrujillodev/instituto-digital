import { ArrowRight } from "lucide-react";
import { useId } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

/** Una responsabilidad del panel: su título, lo que resume y adónde se trabaja. */
export function DashboardSection({
	title,
	description,
	more,
	className,
	children,
}: {
	title: string;
	description?: string;
	more?: { label: string; to: string };
	className?: string;
	children: React.ReactNode;
}) {
	const headingId = useId();

	return (
		<section
			aria-labelledby={headingId}
			className={cn("flex flex-col gap-4", className)}
		>
			<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 id={headingId} className="font-semibold text-lg">
						{title}
					</h2>
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
