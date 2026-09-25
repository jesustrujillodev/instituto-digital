import {
	Archive,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Loader2,
	MoreHorizontal,
} from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

/** Lo que el editor le pide a cada panel antes de cambiar de elemento o de paso. */
export interface PaneHandle {
	/** Guarda lo pendiente. `false` si no se pudo: el cambio no debe seguir. */
	flush: () => Promise<boolean>;
}

export function PaneHeader({
	trail,
	saving,
	dirty,
	previous,
	next,
	menu,
}: {
	trail: string;
	saving: boolean;
	dirty: boolean;
	previous?: { label: string; onClick: () => void } | null;
	next?: { label: string; onClick: () => void } | null;
	menu?: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<p className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
				<span className="truncate">{trail}</span>
				{saving ? (
					<span className="flex shrink-0 items-center gap-1">
						<Loader2 className="size-3 animate-spin" aria-hidden="true" />
						Guardando…
					</span>
				) : dirty ? (
					<span className="shrink-0 text-warning-foreground">
						· Cambios sin guardar
					</span>
				) : null}
			</p>

			<div className="flex shrink-0 items-center gap-0.5">
				{previous !== undefined && (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={previous?.label ?? "No hay anterior"}
						title={previous?.label}
						disabled={!previous}
						onClick={previous?.onClick}
					>
						<ChevronLeft aria-hidden="true" />
					</Button>
				)}
				{next !== undefined && (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={next?.label ?? "No hay siguiente"}
						title={next?.label}
						disabled={!next}
						onClick={next?.onClick}
					>
						<ChevronRight aria-hidden="true" />
					</Button>
				)}
				{menu}
			</div>
		</div>
	);
}

/** El nombre, editable en el sitio con el tamaño de un título. */
export const PaneTitleInput = forwardRef<
	HTMLInputElement,
	{
		label: string;
		value: string;
		onChange: (value: string) => void;
		maxLength: number;
		disabled?: boolean;
		placeholder: string;
	}
>(function PaneTitleInput(
	{ label, value, onChange, maxLength, disabled, placeholder },
	ref,
) {
	return (
		<input
			ref={ref}
			aria-label={label}
			value={value}
			maxLength={maxLength}
			disabled={disabled}
			placeholder={placeholder}
			onChange={(event) => onChange(event.target.value)}
			className={cn(
				"-mx-2 w-[calc(100%+1rem)] rounded-lg border border-transparent bg-transparent px-2 py-1 font-bold text-2xl tracking-tight outline-none transition-colors duration-150",
				"placeholder:text-muted-foreground/60 hover:border-border focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:hover:border-transparent",
				value.trim() === "" && "border-destructive/60",
			)}
		/>
	);
});

export function PaneMenu({
	label,
	busy,
	canMoveUp,
	canMoveDown,
	onMove,
	archive,
}: {
	label: string;
	busy: boolean;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMove?: (delta: number) => void;
	archive: { label: string; disabledReason?: string; onClick: () => void };
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Más acciones de ${label}`}
					disabled={busy}
				>
					<MoreHorizontal aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				{onMove && (
					<>
						<DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
							<ChevronUp aria-hidden="true" />
							Subir
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!canMoveDown}
							onSelect={() => onMove(1)}
						>
							<ChevronDown aria-hidden="true" />
							Bajar
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem
					variant="destructive"
					disabled={Boolean(archive.disabledReason)}
					onSelect={archive.onClick}
				>
					<Archive aria-hidden="true" />
					<span className="flex flex-col">
						{archive.label}
						{archive.disabledReason && (
							<span className="text-muted-foreground text-xs">
								{archive.disabledReason}
							</span>
						)}
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
