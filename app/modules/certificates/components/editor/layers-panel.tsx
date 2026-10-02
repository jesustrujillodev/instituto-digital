import {
	Circle,
	Eye,
	EyeOff,
	Hash,
	Image,
	Lock,
	LockOpen,
	Minus,
	QrCode,
	Square,
	Type,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DesignElement } from "../../domain/design/design-v2.schema";
import { isMandatory } from "../../utils/editor/elements";

const ICONS = {
	text: Type,
	folio: Hash,
	image: Image,
	qr: QrCode,
} as const;

const iconOf = (element: DesignElement) => {
	if (element.type !== "shape") return ICONS[element.type];
	return element.kind === "ellipse"
		? Circle
		: element.kind === "line"
			? Minus
			: Square;
};

interface LayersPanelProps {
	elements: readonly DesignElement[];
	selection: readonly string[];
	readOnly: boolean;
	onSelect: (ids: string[]) => void;
	onToggle: (id: string, field: "locked" | "hidden") => void;
	/** `index` es la posición en el arreglo del diseño (0 = al fondo). */
	onMove: (id: string, index: number) => void;
}

/**
 * Las capas de arriba hacia abajo, como se ven: la primera de la lista es la
 * que queda encima. Se reordenan arrastrando; con el teclado, Ctrl+] y Ctrl+[.
 */
export function LayersPanel({
	elements,
	selection,
	readOnly,
	onSelect,
	onToggle,
	onMove,
}: LayersPanelProps) {
	const [dragging, setDragging] = useState<string | null>(null);
	const [over, setOver] = useState<number | null>(null);
	const rows = [...elements].reverse();
	const toIndex = (row: number) => elements.length - 1 - row;

	return (
		<ul aria-label="Capas" className="flex flex-col gap-0.5 p-2">
			{rows.map((element, row) => {
				const Icon = iconOf(element);
				const active = selection.includes(element.id);
				return (
					<li
						key={element.id}
						draggable={!readOnly}
						onDragStart={(event) => {
							setDragging(element.id);
							event.dataTransfer.effectAllowed = "move";
						}}
						onDragOver={(event) => {
							if (!dragging) return;
							event.preventDefault();
							setOver(row);
						}}
						onDragEnd={() => {
							setDragging(null);
							setOver(null);
						}}
						onDrop={(event) => {
							event.preventDefault();
							if (dragging) onMove(dragging, toIndex(row));
							setDragging(null);
							setOver(null);
						}}
						className={cn(
							"group flex items-center gap-1 rounded-md border border-transparent pr-1 text-xs",
							active ? "border-primary/40 bg-primary/10" : "hover:bg-muted",
							over === row &&
								dragging !== element.id &&
								"border-primary border-dashed",
							element.hidden && "opacity-60",
						)}
					>
						<button
							type="button"
							aria-pressed={active}
							className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onClick={(event) =>
								onSelect(
									event.shiftKey || event.ctrlKey || event.metaKey
										? active
											? selection.filter((id) => id !== element.id)
											: [...selection, element.id]
										: [element.id],
								)
							}
						>
							<Icon
								className="size-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="truncate">{element.name || "Sin nombre"}</span>
							{isMandatory(element) && (
								<span className="ml-auto shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
									Obligatorio
								</span>
							)}
						</button>
						<button
							type="button"
							disabled={readOnly}
							aria-label={
								element.locked
									? `Desbloquear ${element.name}`
									: `Bloquear ${element.name}`
							}
							className={cn(
								"rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40",
								!element.locked &&
									"opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
							)}
							onClick={() => onToggle(element.id, "locked")}
						>
							{element.locked ? (
								<Lock className="size-3.5" />
							) : (
								<LockOpen className="size-3.5" />
							)}
						</button>
						<button
							type="button"
							disabled={readOnly || isMandatory(element)}
							aria-label={
								element.hidden
									? `Mostrar ${element.name}`
									: `Ocultar ${element.name}`
							}
							className={cn(
								"rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40",
								!element.hidden &&
									"opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
							)}
							onClick={() => onToggle(element.id, "hidden")}
						>
							{element.hidden ? (
								<EyeOff className="size-3.5" />
							) : (
								<Eye className="size-3.5" />
							)}
						</button>
					</li>
				);
			})}
		</ul>
	);
}
