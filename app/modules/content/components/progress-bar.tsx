import { cn } from "@/lib/utils";

/** Barra de avance accesible; no hay un Progress en `shared/components/ui`. */
export function ProgressBar({
	value,
	label,
	className,
}: {
	value: number;
	label: string;
	className?: string;
}) {
	const percent = Math.min(100, Math.max(0, value));

	return (
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percent}
			className={cn(
				"h-2 w-full overflow-hidden rounded-full bg-muted",
				className,
			)}
		>
			<div
				className="h-full rounded-full bg-primary transition-[width]"
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}
