import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/shared/view-mode/view-mode";

const OPTIONS = [
	{ value: "grid", label: "Cuadrícula", icon: LayoutGrid },
	{ value: "list", label: "Lista", icon: List },
] as const satisfies readonly {
	value: ViewMode;
	label: string;
	icon: typeof List;
}[];

interface ViewModeToggleProps {
	value: ViewMode;
	onChange: (mode: ViewMode) => void;
	className?: string;
}

/** Conmutador cuadrícula/lista de los listados de cursos. */
export function ViewModeToggle({
	value,
	onChange,
	className,
}: ViewModeToggleProps) {
	return (
		<fieldset
			className={cn(
				"inline-flex shrink-0 items-center gap-0.5 rounded-4xl bg-muted p-0.5",
				className,
			)}
		>
			<legend className="sr-only">Disposición</legend>
			{OPTIONS.map(({ value: option, label, icon: Icon }) => {
				const isActive = value === option;

				return (
					<button
						key={option}
						type="button"
						aria-pressed={isActive}
						aria-label={label}
						title={label}
						onClick={() => onChange(option)}
						className={cn(
							"inline-flex size-8 items-center justify-center rounded-4xl text-muted-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
							isActive
								? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5"
								: "hover:text-foreground",
						)}
					>
						<Icon className="size-4" aria-hidden="true" />
					</button>
				);
			})}
		</fieldset>
	);
}
