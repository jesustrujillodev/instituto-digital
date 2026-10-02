/** Una caja en puntos, con su origen arriba a la izquierda. */
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface RotatedBox extends Box {
	/** Grados, en sentido horario, alrededor del centro de la caja. */
	rotation: number;
}

export interface Point {
	x: number;
	y: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const centerOf = (box: Box): Point => ({
	x: box.x + box.w / 2,
	y: box.y + box.h / 2,
});

/** Las cuatro esquinas tras rotar, en el orden de las agujas del reloj. */
export const cornersOf = (box: RotatedBox): Point[] => {
	const center = centerOf(box);
	const cos = Math.cos(toRadians(box.rotation));
	const sin = Math.sin(toRadians(box.rotation));
	return [
		[-box.w / 2, -box.h / 2],
		[box.w / 2, -box.h / 2],
		[box.w / 2, box.h / 2],
		[-box.w / 2, box.h / 2],
	].map(([dx, dy]) => ({
		x: center.x + dx * cos - dy * sin,
		y: center.y + dx * sin + dy * cos,
	}));
};

/** La caja alineada a los ejes que envuelve a la caja rotada. */
export const aabbOf = (box: RotatedBox): Box => {
	if (box.rotation % 360 === 0)
		return { x: box.x, y: box.y, w: box.w, h: box.h };
	const corners = cornersOf(box);
	const xs = corners.map((point) => point.x);
	const ys = corners.map((point) => point.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/** Tolerancia para errores de coma flotante al rotar. */
const EPSILON = 0.01;

export const isInside = (inner: Box, outer: Box): boolean =>
	inner.x >= outer.x - EPSILON &&
	inner.y >= outer.y - EPSILON &&
	inner.x + inner.w <= outer.x + outer.w + EPSILON &&
	inner.y + inner.h <= outer.y + outer.h + EPSILON;

export const intersects = (a: Box, b: Box): boolean =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
