import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { DesignElement } from "../../domain/design/design-v2.schema";
import type { Box } from "../../domain/design/geometry";
import { HANDLES, type Handle } from "../../utils/editor/geometry";
import type { Guide } from "../../utils/editor/snapping";

/** Dónde va cada tirador, en fracciones del ancho y alto de la caja. */
const HANDLE_POSITION: Record<Handle, [number, number]> = {
	nw: [0, 0],
	n: [0.5, 0],
	ne: [1, 0],
	e: [1, 0.5],
	se: [1, 1],
	s: [0.5, 1],
	sw: [0, 1],
	w: [0, 0.5],
};

const HANDLE_CURSOR: Record<Handle, string> = {
	nw: "nwse-resize",
	se: "nwse-resize",
	ne: "nesw-resize",
	sw: "nesw-resize",
	n: "ns-resize",
	s: "ns-resize",
	e: "ew-resize",
	w: "ew-resize",
};

const CORNERS: readonly Handle[] = ["nw", "ne", "se", "sw"];

interface SelectionOverlayProps {
	/** Puntos a px de pantalla. */
	scale: number;
	selected: readonly DesignElement[];
	hovered: DesignElement | null;
	/** La caja del grupo cuando hay varios seleccionados. */
	groupBounds: Box | null;
	guides: readonly Guide[];
	marquee: Box | null;
	/** Sin tiradores: bloqueado, solo lectura o editando texto. */
	showHandles: boolean;
	/** Tiradores que no aplican (un texto no se escala por esquinas con proporción…). */
	allowRotate: boolean;
	onHandleDown: (event: ReactPointerEvent, handle: Handle | "rotate") => void;
}

const boxStyle = (box: Box, scale: number, rotation = 0) => ({
	left: box.x * scale,
	top: box.y * scale,
	width: box.w * scale,
	height: box.h * scale,
	transform: rotation ? `rotate(${rotation}deg)` : undefined,
});

function Handles({
	handles,
	allowRotate,
	onHandleDown,
}: {
	handles: readonly Handle[];
	allowRotate: boolean;
	onHandleDown: SelectionOverlayProps["onHandleDown"];
}) {
	return (
		<>
			{handles.map((handle) => {
				const [fx, fy] = HANDLE_POSITION[handle];
				return (
					<span
						key={handle}
						data-handle={handle}
						className="pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-primary bg-background shadow-sm"
						style={{
							left: `${fx * 100}%`,
							top: `${fy * 100}%`,
							cursor: HANDLE_CURSOR[handle],
						}}
						onPointerDown={(event) => onHandleDown(event, handle)}
					/>
				);
			})}
			{allowRotate && (
				<>
					<span className="absolute top-0 left-1/2 h-5 w-px -translate-y-full bg-primary" />
					<span
						data-handle="rotate"
						title="Girar (Shift: de 15 en 15)"
						className="pointer-events-auto absolute top-0 left-1/2 size-3 -translate-x-1/2 -translate-y-[calc(100%+1.25rem)] cursor-grab rounded-full border border-primary bg-background shadow-sm"
						onPointerDown={(event) => onHandleDown(event, "rotate")}
					/>
				</>
			)}
		</>
	);
}

/**
 * Marcos, tiradores, guías y marquesina sobre el lienzo. Se dibujan con las
 * cajas del modelo, no leyendo el `iframe`: lo que se ve encaja con lo que se
 * guarda por construcción.
 */
export function SelectionOverlay({
	scale,
	selected,
	hovered,
	groupBounds,
	guides,
	marquee,
	showHandles,
	allowRotate,
	onHandleDown,
}: SelectionOverlayProps) {
	const single = selected.length === 1 ? selected[0] : null;

	return (
		<div className="pointer-events-none absolute inset-0">
			{hovered && !selected.some((element) => element.id === hovered.id) && (
				<div
					className="absolute border border-primary/60"
					style={boxStyle(hovered, scale, hovered.rotation)}
				/>
			)}

			{selected.map((element) => (
				<div
					key={element.id}
					className={cn(
						"absolute border-[1.5px]",
						element.locked
							? "border-muted-foreground border-dashed"
							: "border-primary",
					)}
					style={boxStyle(element, scale, element.rotation)}
				>
					{single && showHandles && (
						<Handles
							handles={HANDLES}
							allowRotate={allowRotate}
							onHandleDown={onHandleDown}
						/>
					)}
				</div>
			))}

			{groupBounds && (
				<div
					className="absolute border border-primary border-dashed"
					style={boxStyle(groupBounds, scale)}
				>
					{showHandles && (
						<Handles
							handles={CORNERS}
							allowRotate={false}
							onHandleDown={onHandleDown}
						/>
					)}
				</div>
			)}

			{guides.map((guide) => (
				<div
					key={`${guide.axis}:${guide.at}:${guide.from}:${guide.to}`}
					className="absolute bg-pink-500"
					style={
						guide.axis === "x"
							? {
									left: guide.at * scale,
									top: guide.from * scale,
									width: 1,
									height: (guide.to - guide.from) * scale,
								}
							: {
									top: guide.at * scale,
									left: guide.from * scale,
									height: 1,
									width: (guide.to - guide.from) * scale,
								}
					}
				/>
			))}

			{marquee && (
				<div
					className="absolute border border-primary bg-primary/10"
					style={boxStyle(marquee, scale)}
				/>
			)}
		</div>
	);
}
