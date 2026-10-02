import { SAFE_MARGIN_PT } from "../../domain/design/design-v2.config";
import type { Box } from "../../domain/design/geometry";

export interface Guide {
	/** `x`: línea vertical en `at`; `y`: horizontal. */
	axis: "x" | "y";
	at: number;
	from: number;
	to: number;
}

export interface SnapResult {
	dx: number;
	dy: number;
	guides: Guide[];
}

interface Target {
	at: number;
	/** Extensión de la guía sobre el otro eje. */
	from: number;
	to: number;
}

const edges = (start: number, size: number) => [
	start,
	start + size / 2,
	start + size,
];

const targetsOf = (
	axis: "x" | "y",
	page: { w: number; h: number },
	others: readonly Box[],
): Target[] => {
	const side = axis === "x" ? page.w : page.h;
	const cross = axis === "x" ? page.h : page.w;
	return [
		...[0, SAFE_MARGIN_PT, side / 2, side - SAFE_MARGIN_PT, side].map((at) => ({
			at,
			from: 0,
			to: cross,
		})),
		...others.flatMap((box) => {
			const start = axis === "x" ? box.x : box.y;
			const size = axis === "x" ? box.w : box.h;
			const crossStart = axis === "x" ? box.y : box.x;
			const crossSize = axis === "x" ? box.h : box.w;
			return edges(start, size).map((at) => ({
				at,
				from: crossStart,
				to: crossStart + crossSize,
			}));
		}),
	];
};

const snapAxis = (
	axis: "x" | "y",
	moving: Box,
	targets: readonly Target[],
	threshold: number,
): { delta: number; guides: Guide[] } => {
	const start = axis === "x" ? moving.x : moving.y;
	const size = axis === "x" ? moving.w : moving.h;
	const crossStart = axis === "x" ? moving.y : moving.x;
	const crossEnd = crossStart + (axis === "x" ? moving.h : moving.w);

	let best: number | null = null;
	for (const line of edges(start, size)) {
		for (const target of targets) {
			const delta = target.at - line;
			if (
				Math.abs(delta) <= threshold &&
				(best === null || Math.abs(delta) < Math.abs(best))
			) {
				best = delta;
			}
		}
	}
	if (best === null) return { delta: 0, guides: [] };

	const snapped = edges(start + best, size);
	const guides = targets
		.filter((target) =>
			snapped.some((line) => Math.abs(line - target.at) < 0.01),
		)
		.map((target) => ({
			axis,
			at: target.at,
			from: Math.min(target.from, crossStart),
			to: Math.max(target.to, crossEnd),
		}));
	// Dos destinos en la misma línea pintan una sola guía.
	const unique = new Map(
		guides.map((guide) => [`${guide.at}:${guide.from}:${guide.to}`, guide]),
	);
	return { delta: best, guides: [...unique.values()] };
};

/**
 * Cuánto corregir un movimiento para que un borde o el centro de la caja caiga
 * sobre la página (bordes, centro, margen de seguridad) o sobre otro elemento,
 * y qué guías pintar. Cada eje se ajusta por separado.
 *
 * @param threshold En puntos: quien llama convierte los px de pantalla con la escala.
 */
export const snapMove = (
	moving: Box,
	others: readonly Box[],
	page: { w: number; h: number },
	threshold: number,
): SnapResult => {
	const x = snapAxis("x", moving, targetsOf("x", page, others), threshold);
	const y = snapAxis("y", moving, targetsOf("y", page, others), threshold);
	return { dx: x.delta, dy: y.delta, guides: [...x.guides, ...y.guides] };
};
