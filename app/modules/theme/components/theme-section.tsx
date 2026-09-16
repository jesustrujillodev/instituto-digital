import { ChevronDown, CircleAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";

interface ThemeSectionProps {
	title: string;
	description?: string;
	/**
	 * Veredicto de la sección, visible con la sección plegada.
	 *
	 * Sin esto un aviso solo existía para quien ya había desplegado, y las
	 * secciones empiezan plegadas: justo quien no está mirando es quien lo
	 * necesita.
	 */
	status?: string;
	/** `danger` pinta el veredicto en destructive y le antepone el icono. */
	tone?: "muted" | "danger";
	defaultOpen?: boolean;
	/** El panel está bloqueado: la sección se enseña abierta y sin plegar. */
	readOnly?: boolean;
	children: React.ReactNode;
}

/**
 * Sección plegable de la columna de edición.
 *
 * No trae tarjeta propia a propósito: la columna entera es UNA superficie y las
 * secciones se separan con un divisor. Antes cada sección era su propio
 * `border bg-card`, así que la columna eran siete cajas apiladas y el picker de
 * color abría una octava dentro de una de ellas.
 */
export function ThemeSection({
	title,
	description,
	status,
	tone = "muted",
	defaultOpen = false,
	readOnly = false,
	children,
}: ThemeSectionProps) {
	const [open, setOpen] = useState(defaultOpen);

	// Con el panel bloqueado el disparador queda deshabilitado por el `fieldset`
	// de fuera, así que un preset se abre entero: se puede LEER todo aunque no se
	// pueda tocar nada.
	return (
		<Collapsible
			open={readOnly || open}
			onOpenChange={setOpen}
			className="border-t first:border-t-0"
		>
			<CollapsibleTrigger className="flex w-full items-center gap-3 p-3 text-left">
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="text-sm font-medium">{title}</span>
					{description && (
						<span className="text-xs text-muted-foreground">{description}</span>
					)}
				</span>

				{status && (
					<span
						className={cn(
							"flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums",
							tone === "danger" ? "text-destructive" : "text-muted-foreground",
						)}
					>
						{tone === "danger" && (
							<CircleAlert className="size-3.5" aria-hidden="true" />
						)}
						{status}
					</span>
				)}

				<ChevronDown
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					aria-hidden="true"
				/>
			</CollapsibleTrigger>

			<CollapsibleContent className="flex flex-col gap-4 px-3 pb-4">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
