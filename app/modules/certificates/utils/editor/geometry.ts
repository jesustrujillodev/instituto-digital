import type { DesignElement } from "../../domain/design/design-v2.schema";
import {
	aabbOf,
	type Box,
	centerOf,
	type Point,
	type RotatedBox,
} from "../../domain/design/geometry";

export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type Handle = (typeof HANDLES)[number];

/** Lo más pequeño que un elemento puede quedar al redimensionarlo. */
export const MIN_ELEMENT_PT = 4;

/** Ángulo al que se ajusta la rotación con Shift. */
export const ROTATION_SNAP_DEG = 15;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Rota un vector alrededor del origen. */
const rotate = ({ x, y }: Point, degrees: number): Point => {
	const cos = Math.cos(toRadians(degrees));
	const sin = Math.sin(toRadians(degrees));
	return { x: x * cos - y * sin, y: x * sin + y * cos };
};

/** Un punto de la página llevado al marco del elemento, con el centro en 0,0. */
export const toLocal = (box: RotatedBox, point: Point): Point => {
	const center = centerOf(box);
	return rotate(
		{ x: point.x - center.x, y: point.y - center.y },
		-box.rotation,
	);
};

export const containsPoint = (box: RotatedBox, point: Point): boolean => {
	const local = toLocal(box, point);
	return Math.abs(local.x) <= box.w / 2 && Math.abs(local.y) <= box.h / 2;
};

/** El elemento visible más alto bajo el punto: el último del arreglo gana. */
export const hitTest = (
	elements: readonly DesignElement[],
	point: Point,
): DesignElement | null => {
	for (let index = elements.length - 1; index >= 0; index--) {
		const element = elements[index];
		if (!element.hidden && containsPoint(element, point)) return element;
	}
	return null;
};

/** Los elementos visibles cuya caja envolvente toca el rectángulo de selección. */
export const elementsInMarquee = (
	elements: readonly DesignElement[],
	marquee: Box,
): DesignElement[] =>
	elements.filter((element) => {
		if (element.hidden) return false;
		const box = aabbOf(element);
		return (
			box.x < marquee.x + marquee.w &&
			marquee.x < box.x + box.w &&
			box.y < marquee.y + marquee.h &&
			marquee.y < box.y + box.h
		);
	});

/** La caja que envuelve a varias cajas rotadas. */
export const boundsOf = (boxes: readonly RotatedBox[]): Box | null => {
	if (boxes.length === 0) return null;
	const aabbs = boxes.map(aabbOf);
	const x = Math.min(...aabbs.map((box) => box.x));
	const y = Math.min(...aabbs.map((box) => box.y));
	return {
		x,
		y,
		w: Math.max(...aabbs.map((box) => box.x + box.w)) - x,
		h: Math.max(...aabbs.map((box) => box.y + box.h)) - y,
	};
};

const SIGN: Record<Handle, [number, number]> = {
	nw: [-1, -1],
	n: [0, -1],
	ne: [1, -1],
	e: [1, 0],
	se: [1, 1],
	s: [0, 1],
	sw: [-1, 1],
	w: [-1, 0],
};

export interface ResizeOptions {
	/** Conservar la proporción (Shift, o siempre en imágenes y QR). */
	keepAspect: boolean;
}

/**
 * La caja tras arrastrar un tirador `delta` puntos de página. Se calcula en el
 * marco del elemento, así que funciona igual rotado: el lado o la esquina
 * opuesta al tirador se queda quieta en la página.
 */
export const resizeBox = (
	box: RotatedBox,
	handle: Handle,
	delta: Point,
	{ keepAspect }: ResizeOptions,
): RotatedBox => {
	const [sx, sy] = SIGN[handle];
	const local = rotate(delta, -box.rotation);

	let w = Math.max(MIN_ELEMENT_PT, box.w + sx * local.x);
	let h = Math.max(MIN_ELEMENT_PT, box.h + sy * local.y);

	if (keepAspect) {
		const ratio = box.w / box.h;
		if (sx !== 0 && sy !== 0) {
			const scale = Math.max(w / box.w, h / box.h);
			w = box.w * scale;
			h = box.h * scale;
		} else if (sx !== 0) {
			h = w / ratio;
		} else {
			w = h * ratio;
		}
		if (w < MIN_ELEMENT_PT || h < MIN_ELEMENT_PT) {
			const grow = Math.max(MIN_ELEMENT_PT / w, MIN_ELEMENT_PT / h);
			w *= grow;
			h *= grow;
		}
	}

	const before = rotate(
		{ x: (-sx * box.w) / 2, y: (-sy * box.h) / 2 },
		box.rotation,
	);
	const after = rotate({ x: (-sx * w) / 2, y: (-sy * h) / 2 }, box.rotation);
	const center = centerOf(box);
	const nextCenter = {
		x: center.x + before.x - after.x,
		y: center.y + before.y - after.y,
	};

	return {
		x: nextCenter.x - w / 2,
		y: nextCenter.y - h / 2,
		w,
		h,
		rotation: box.rotation,
	};
};

/** Grados en (-180, 180]. */
export const normalizeAngle = (degrees: number): number => {
	const turned = ((degrees % 360) + 360) % 360;
	return turned > 180 ? turned - 360 : turned;
};

/**
 * La rotación al girar con el tirador: el ángulo del puntero alrededor del
 * centro, relativo a donde empezó el gesto.
 */
export const rotationFor = (
	box: Box,
	startRotation: number,
	from: Point,
	to: Point,
	{ snap, step = 1 }: { snap: boolean; step?: number },
): number => {
	const center = centerOf(box);
	const start = toDegrees(Math.atan2(from.y - center.y, from.x - center.x));
	const now = toDegrees(Math.atan2(to.y - center.y, to.x - center.x));
	const raw = normalizeAngle(startRotation + now - start);
	const unit = snap ? ROTATION_SNAP_DEG : step;
	return normalizeAngle(Math.round(raw / unit) * unit);
};

/** Redondeo a centésimas de punto: el JSON no se llena de decimales de coma flotante. */
export const roundPt = (value: number): number => Math.round(value * 100) / 100;

export const roundBox = <T extends Box>(box: T): T => ({
	...box,
	x: roundPt(box.x),
	y: roundPt(box.y),
	w: roundPt(box.w),
	h: roundPt(box.h),
});
