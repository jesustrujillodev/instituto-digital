import type { DesignElement } from "../../domain/design/design-v2.schema";
import { aabbOf, type Box } from "../../domain/design/geometry";
import { boundsOf, roundPt } from "./geometry";

export const ALIGNMENTS = [
	"left",
	"center-x",
	"right",
	"top",
	"center-y",
	"bottom",
] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

const shiftFor = (box: Box, target: Box, alignment: Alignment) => {
	switch (alignment) {
		case "left":
			return { dx: target.x - box.x, dy: 0 };
		case "center-x":
			return { dx: target.x + target.w / 2 - (box.x + box.w / 2), dy: 0 };
		case "right":
			return { dx: target.x + target.w - (box.x + box.w), dy: 0 };
		case "top":
			return { dx: 0, dy: target.y - box.y };
		case "center-y":
			return { dx: 0, dy: target.y + target.h / 2 - (box.y + box.h / 2) };
		case "bottom":
			return { dx: 0, dy: target.y + target.h - (box.y + box.h) };
	}
};

const movable = (
	elements: readonly DesignElement[],
	ids: readonly string[],
) => {
	const wanted = new Set(ids);
	return elements.filter(
		(element) => wanted.has(element.id) && !element.locked,
	);
};

/**
 * Alinea la selección. Con un solo elemento, contra la página; con varios,
 * contra la caja que los envuelve. Los bloqueados no se mueven.
 */
export const alignElements = (
	elements: readonly DesignElement[],
	ids: readonly string[],
	alignment: Alignment,
	page: { w: number; h: number },
): DesignElement[] => {
	const targets = movable(elements, ids);
	if (targets.length === 0) return [...elements];

	const reference =
		targets.length === 1
			? { x: 0, y: 0, w: page.w, h: page.h }
			: (boundsOf(targets) as Box);

	const shifts = new Map(
		targets.map((element) => [
			element.id,
			shiftFor(aabbOf(element), reference, alignment),
		]),
	);
	return elements.map((element) => {
		const shift = shifts.get(element.id);
		return shift
			? {
					...element,
					x: roundPt(element.x + shift.dx),
					y: roundPt(element.y + shift.dy),
				}
			: element;
	});
};

/**
 * Reparte el espacio entre tres o más elementos por igual, dejando quietos al
 * primero y al último del eje.
 */
export const distributeElements = (
	elements: readonly DesignElement[],
	ids: readonly string[],
	axis: "x" | "y",
): DesignElement[] => {
	const targets = movable(elements, ids);
	if (targets.length < 3) return [...elements];

	const start = (box: Box) => (axis === "x" ? box.x : box.y);
	const size = (box: Box) => (axis === "x" ? box.w : box.h);
	const sorted = targets
		.map((element) => ({ element, box: aabbOf(element) }))
		.sort((a, b) => start(a.box) - start(b.box));

	const first = sorted[0].box;
	const last = sorted[sorted.length - 1].box;
	const occupied = sorted.reduce((sum, { box }) => sum + size(box), 0);
	const gap =
		(start(last) + size(last) - start(first) - occupied) / (sorted.length - 1);

	const shifts = new Map<string, number>();
	let cursor = start(first);
	for (const { element, box } of sorted) {
		shifts.set(element.id, cursor - start(box));
		cursor += size(box) + gap;
	}

	return elements.map((element) => {
		const shift = shifts.get(element.id);
		if (shift === undefined) return element;
		return axis === "x"
			? { ...element, x: roundPt(element.x + shift) }
			: { ...element, y: roundPt(element.y + shift) };
	});
};
