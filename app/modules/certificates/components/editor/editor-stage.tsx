import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import type { CertificateRenderData } from "../../domain/certificate.types";
import {
	CSS_PX_PER_PT,
	QR_MIN_SIDE_PT,
} from "../../domain/design/design-v2.config";
import type {
	CertificateDesignV2,
	DesignElement,
	TextElement,
} from "../../domain/design/design-v2.schema";
import { aabbOf, type Box, type Point } from "../../domain/design/geometry";
import { useEditorStageDocument } from "../../hooks/use-editor-stage-document";
import { replaceElements, updateElement } from "../../utils/editor/commands";
import { keepsAspect } from "../../utils/editor/elements";
import {
	boundsOf,
	elementsInMarquee,
	type Handle,
	hitTest,
	resizeBox,
	rotationFor,
	roundBox,
	roundPt,
} from "../../utils/editor/geometry";
import { grownTextHeight, scaleGroup } from "../../utils/editor/page";
import { type Guide, snapMove } from "../../utils/editor/snapping";
import { InlineTextEditor } from "./inline-text-editor";
import { SelectionOverlay } from "./selection-overlay";

/** Distancia de imán de las guías, en px de pantalla. */
const SNAP_PX = 6;
/** Margen alrededor de la página al ajustarla a la ventana. */
const FIT_PADDING_PX = 48;
export const ZOOM_RANGE = { min: 0.1, max: 4 } as const;

export type Zoom = number | "fit";

type Gesture =
	| {
			kind: "move";
			start: Point;
			base: CertificateDesignV2;
			origin: DesignElement[];
			others: Box[];
			key: string;
	  }
	| {
			kind: "resize";
			start: Point;
			base: CertificateDesignV2;
			origin: DesignElement;
			handle: Handle;
			key: string;
	  }
	| {
			kind: "group";
			start: Point;
			base: CertificateDesignV2;
			origin: DesignElement[];
			bounds: Box;
			handle: Handle;
			key: string;
	  }
	| {
			kind: "rotate";
			start: Point;
			base: CertificateDesignV2;
			origin: DesignElement;
			key: string;
	  }
	| { kind: "marquee"; start: Point; additive: string[] };

interface EditorStageProps {
	design: CertificateDesignV2;
	data: CertificateRenderData;
	logoUrls: Record<string, string>;
	selection: readonly string[];
	zoom: Zoom;
	onScale: (scale: number) => void;
	readOnly: boolean;
	onCommit: (
		design: CertificateDesignV2,
		coalesceKey?: string,
		select?: string[],
	) => void;
	onSeal: () => void;
	onSelect: (ids: string[]) => void;
}

let gestureCount = 0;

/**
 * El lienzo: el certificado real en un `iframe` (el mismo HTML que exporta
 * Chromium) y, encima, una capa que recibe el puntero. Todo se calcula en
 * puntos del modelo; la pantalla solo multiplica por la escala.
 */
export function EditorStage({
	design,
	data,
	logoUrls,
	selection,
	zoom,
	onScale,
	readOnly,
	onCommit,
	onSeal,
	onSelect,
}: EditorStageProps) {
	const viewport = useRef<HTMLDivElement>(null);
	const surface = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLIFrameElement>(null);
	const gesture = useRef<Gesture | null>(null);

	const [available, setAvailable] = useState({ width: 0, height: 0 });
	const [guides, setGuides] = useState<Guide[]>([]);
	const [marquee, setMarquee] = useState<Box | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [spaceHeld, setSpaceHeld] = useState(false);
	const pan = useRef<{
		x: number;
		y: number;
		left: number;
		top: number;
	} | null>(null);
	const [panning, setPanning] = useState(false);

	// Espacio sostenido convierte el arrastre en desplazamiento, como en los
	// editores de diseño: sin barras, es la forma de recorrer el lienzo con zoom.
	useEffect(() => {
		const typing = (target: EventTarget | null) =>
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
		const down = (event: KeyboardEvent) => {
			if (event.code !== "Space" || typing(event.target)) return;
			event.preventDefault();
			setSpaceHeld(true);
		};
		const up = (event: KeyboardEvent) => {
			if (event.code === "Space") setSpaceHeld(false);
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, []);

	const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
		const element = viewport.current;
		if (!element || !(event.button === 1 || spaceHeld)) return;
		event.preventDefault();
		pan.current = {
			x: event.clientX,
			y: event.clientY,
			left: element.scrollLeft,
			top: element.scrollTop,
		};
		element.setPointerCapture(event.pointerId);
		setPanning(true);
	};

	const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
		const element = viewport.current;
		if (!element || !pan.current) return;
		element.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
		element.scrollTop = pan.current.top - (event.clientY - pan.current.y);
	};

	const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!pan.current) return;
		pan.current = null;
		viewport.current?.releasePointerCapture(event.pointerId);
		setPanning(false);
	};

	const onFrameLoad = useEditorStageDocument(frame, {
		design,
		data,
		logoUrls,
		editingId,
	});

	useEffect(() => {
		const element = viewport.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) =>
			setAvailable({
				width: entry.contentRect.width,
				height: entry.contentRect.height,
			}),
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const pagePx = {
		width: design.page.widthPt * CSS_PX_PER_PT,
		height: design.page.heightPt * CSS_PX_PER_PT,
	};
	const fit = Math.min(
		(available.width - FIT_PADDING_PX - 2) / pagePx.width,
		(available.height - FIT_PADDING_PX - 2) / pagePx.height,
	);
	const scale =
		zoom === "fit"
			? Math.max(ZOOM_RANGE.min, Math.min(ZOOM_RANGE.max, fit || 0))
			: zoom;
	/** px de pantalla por punto. */
	const pxPerPt = scale * CSS_PX_PER_PT;

	useEffect(() => {
		if (scale > 0) onScale(scale);
	}, [scale, onScale]);

	const selected = useMemo(() => {
		const wanted = new Set(selection);
		return design.elements.filter((element) => wanted.has(element.id));
	}, [design.elements, selection]);

	const toPt = (event: { clientX: number; clientY: number }): Point => {
		const rect = surface.current?.getBoundingClientRect();
		if (!rect) return { x: 0, y: 0 };
		return {
			x: (event.clientX - rect.left) / pxPerPt,
			y: (event.clientY - rect.top) / pxPerPt,
		};
	};

	const begin = (event: ReactPointerEvent, next: Gesture) => {
		gesture.current = next;
		surface.current?.setPointerCapture(event.pointerId);
	};

	const startMove = (event: ReactPointerEvent, ids: readonly string[]) => {
		const wanted = new Set(ids);
		const origin = design.elements.filter(
			(element) => wanted.has(element.id) && !element.locked,
		);
		if (origin.length === 0) return;
		begin(event, {
			kind: "move",
			start: toPt(event),
			base: design,
			origin,
			others: design.elements
				.filter((element) => !wanted.has(element.id) && !element.hidden)
				.map(aabbOf),
			key: `move-${++gestureCount}`,
		});
	};

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		// Botón central o Espacio: lo recoge el visor para desplazar.
		if (event.button !== 0 || spaceHeld || editingId) return;
		const point = toPt(event);
		const hit = hitTest(design.elements, point);

		if (!hit) {
			if (!event.shiftKey) onSelect([]);
			begin(event, {
				kind: "marquee",
				start: point,
				additive: event.shiftKey ? [...selection] : [],
			});
			return;
		}

		let next = [...selection];
		if (event.shiftKey) {
			next = next.includes(hit.id)
				? next.filter((id) => id !== hit.id)
				: [...next, hit.id];
		} else if (!next.includes(hit.id)) {
			next = [hit.id];
		}
		onSelect(next);
		if (!readOnly && next.includes(hit.id)) startMove(event, next);
	};

	const handleHandleDown = (
		event: ReactPointerEvent,
		handle: Handle | "rotate",
	) => {
		if (readOnly || event.button !== 0) return;
		event.stopPropagation();
		const start = toPt(event);
		const key = `${handle}-${++gestureCount}`;

		if (selected.length > 1) {
			const bounds = boundsOf(selected);
			if (!bounds || handle === "rotate") return;
			begin(event, {
				kind: "group",
				start,
				base: design,
				origin: selected,
				bounds,
				handle,
				key,
			});
			return;
		}
		const [origin] = selected;
		if (!origin || origin.locked) return;
		begin(
			event,
			handle === "rotate"
				? { kind: "rotate", start, base: design, origin, key }
				: { kind: "resize", start, base: design, origin, handle, key },
		);
	};

	const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = gesture.current;
		const point = toPt(event);

		if (!current) {
			setHovered(hitTest(design.elements, point)?.id ?? null);
			return;
		}

		if (current.kind === "marquee") {
			const box = {
				x: Math.min(current.start.x, point.x),
				y: Math.min(current.start.y, point.y),
				w: Math.abs(point.x - current.start.x),
				h: Math.abs(point.y - current.start.y),
			};
			setMarquee(box);
			return;
		}

		const delta = {
			x: point.x - current.start.x,
			y: point.y - current.start.y,
		};

		if (current.kind === "move") {
			let { x: dx, y: dy } = delta;
			const bounds = boundsOf(current.origin);
			if (bounds && !event.altKey) {
				const snap = snapMove(
					{ ...bounds, x: bounds.x + dx, y: bounds.y + dy },
					current.others,
					{ w: design.page.widthPt, h: design.page.heightPt },
					SNAP_PX / pxPerPt,
				);
				dx += snap.dx;
				dy += snap.dy;
				setGuides(snap.guides);
			} else {
				setGuides([]);
			}
			onCommit(
				replaceElements(
					current.base,
					current.origin.map((element) => ({
						...element,
						x: roundPt(element.x + dx),
						y: roundPt(element.y + dy),
					})),
				),
				current.key,
			);
			return;
		}

		if (current.kind === "resize") {
			const { origin } = current;
			let box = resizeBox(origin, current.handle, delta, {
				keepAspect: event.shiftKey || keepsAspect(origin),
			});
			if (origin.type === "qr" && box.w < QR_MIN_SIDE_PT) {
				box = resizeBox(
					origin,
					current.handle,
					{ x: 0, y: 0 },
					{ keepAspect: true },
				);
			}
			onCommit(
				updateElement(current.base, origin.id, roundBox({ ...origin, ...box })),
				current.key,
			);
			return;
		}

		if (current.kind === "group") {
			const next = resizeBox(
				{ ...current.bounds, rotation: 0 },
				current.handle,
				delta,
				{ keepAspect: event.shiftKey },
			);
			onCommit(
				replaceElements(
					current.base,
					scaleGroup(current.origin, current.bounds, next),
				),
				current.key,
			);
			return;
		}

		const { origin } = current;
		const rotation = rotationFor(
			origin,
			origin.rotation,
			current.start,
			point,
			{
				snap: event.shiftKey,
				step: origin.type === "qr" ? 90 : 1,
			},
		);
		onCommit(updateElement(current.base, origin.id, { rotation }), current.key);
	};

	const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = gesture.current;
		gesture.current = null;
		surface.current?.releasePointerCapture(event.pointerId);
		setGuides([]);

		if (current?.kind === "marquee") {
			if (marquee && marquee.w > 1 && marquee.h > 1) {
				const picked = elementsInMarquee(design.elements, marquee).map(
					(e) => e.id,
				);
				onSelect([...new Set([...current.additive, ...picked])]);
			}
			setMarquee(null);
			return;
		}
		if (current) onSeal();
	};

	const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
		if (readOnly) return;
		const hit = hitTest(design.elements, toPt(event));
		if (hit?.type === "text" && !hit.locked) {
			onSelect([hit.id]);
			setEditingId(hit.id);
		}
	};

	const editing = design.elements.find(
		(element): element is TextElement =>
			element.id === editingId && element.type === "text",
	);

	return (
		<div
			ref={viewport}
			// Sin barras de desplazamiento: se recorre con la rueda (Shift para el
			// eje horizontal), arrastrando con Espacio o con el botón central.
			className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] bg-muted/40 [background-size:18px_18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			style={{ cursor: panning ? "grabbing" : spaceHeld ? "grab" : undefined }}
			onPointerDown={startPan}
			onPointerMove={movePan}
			onPointerUp={endPan}
		>
			<div
				className="grid min-h-full min-w-full place-items-center"
				style={{ padding: FIT_PADDING_PX / 2 }}
			>
				<div
					className="relative shrink-0 bg-white shadow-lg ring-1 ring-foreground/10"
					style={{ width: pagePx.width * scale, height: pagePx.height * scale }}
				>
					<iframe
						ref={frame}
						title="Lienzo del certificado"
						sandbox="allow-same-origin"
						tabIndex={-1}
						onLoad={onFrameLoad}
						className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
						style={{
							width: pagePx.width,
							height: pagePx.height,
							transform: `scale(${scale})`,
						}}
					/>
					<div
						ref={surface}
						role="application"
						aria-label="Lienzo del certificado. Con el teclado, elige elementos en el panel de capas."
						className={cn(
							"absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring",
							!spaceHeld && !panning && "cursor-default",
						)}
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerLeave={() => setHovered(null)}
						onDoubleClick={handleDoubleClick}
					>
						<SelectionOverlay
							scale={pxPerPt}
							selected={editing ? [] : selected}
							hovered={
								gesture.current || editing
									? null
									: (design.elements.find(
											(element) => element.id === hovered,
										) ?? null)
							}
							groupBounds={selected.length > 1 ? boundsOf(selected) : null}
							guides={guides}
							marquee={marquee}
							showHandles={!readOnly}
							allowRotate={!readOnly}
							onHandleDown={handleHandleDown}
						/>
						{editing && (
							<InlineTextEditor
								element={editing}
								scale={pxPerPt}
								onChange={(content) =>
									onCommit(
										updateElement(design, editing.id, {
											content,
											h: grownTextHeight({ ...editing, content }),
										}),
										`text-${editing.id}`,
									)
								}
								onDone={() => {
									setEditingId(null);
									onSeal();
								}}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
