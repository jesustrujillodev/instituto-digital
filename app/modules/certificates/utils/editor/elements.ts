import { CERTIFICATE_ACCENTS } from "../../domain/certificate.config";
import {
	DESIGN_TOKEN_LABELS,
	type DesignToken,
} from "../../domain/design/design.tokens";
import type {
	DesignElement,
	ImageElement,
	ImageSource,
	ShapeElement,
	TextElement,
} from "../../domain/design/design-v2.schema";
import { aabbOf } from "../../domain/design/geometry";
import { roundPt } from "./geometry";

// ===============================================================
// Elementos nuevos
// ===============================================================
// Lo que el editor inserta, creado en el centro de la página (placeInFreeSpot lo aparta de lo que ya hay). Puras: el id lo da quien
// llama, así se prueban sin azar.

export interface PageSize {
	w: number;
	h: number;
}

const centered = (page: PageSize, w: number, h: number) => ({
	x: roundPt((page.w - w) / 2),
	y: roundPt((page.h - h) / 2),
	w: roundPt(w),
	h: roundPt(h),
	rotation: 0,
	opacity: 1,
	locked: false,
	hidden: false,
});

const TEXT_DEFAULTS = {
	fontId: "avant-garde",
	weight: 400,
	italic: false,
	color: "#1f1f1f",
	align: "center",
	vAlign: "middle",
	lineHeight: 1.25,
	letterSpacing: 0,
	uppercase: false,
} as const satisfies Partial<TextElement>;

export const createTextElement = (
	id: string,
	page: PageSize,
	content = "Escribe aquí",
): TextElement => ({
	...centered(page, 320, 32),
	...TEXT_DEFAULTS,
	id,
	name: "Texto",
	type: "text",
	content,
	sizePt: 18,
	fit: "wrap",
	minSizePt: 8,
});

/** Un campo dinámico: baja de cuerpo para caber, porque su largo no se conoce. */
export const createFieldElement = (
	id: string,
	page: PageSize,
	token: DesignToken,
): TextElement => {
	const large = token === "participante" || token === "capacitacion";
	return {
		...createTextElement(id, page, `{${token}}`),
		...(large && {
			...centered(page, 520, 56),
			fontId: "eb-garamond",
		}),
		name: DESIGN_TOKEN_LABELS[token],
		sizePt: large ? 36 : 14,
		fit: "shrink",
		minSizePt: large ? 16 : 8,
	};
};

const SHAPE_SIZES: Record<ShapeElement["kind"], [number, number]> = {
	rect: [180, 110],
	ellipse: [120, 120],
	line: [220, 6],
};

const SHAPE_NAMES: Record<ShapeElement["kind"], string> = {
	rect: "Rectángulo",
	ellipse: "Elipse",
	line: "Línea",
};

export const createShapeElement = (
	id: string,
	page: PageSize,
	kind: ShapeElement["kind"],
): ShapeElement => {
	const [w, h] = SHAPE_SIZES[kind];
	const accent = CERTIFICATE_ACCENTS[0];
	return {
		...centered(page, w, h),
		id,
		name: SHAPE_NAMES[kind],
		type: "shape",
		kind,
		fill: kind === "line" ? null : accent,
		stroke: kind === "line" ? accent : null,
		strokeWidth: kind === "line" ? 1.5 : 0,
		cornerRadius: 0,
	};
};

/** Lo más que mide de lado una imagen recién insertada. */
const IMAGE_MAX_SIDE_PT = 220;

export const createImageElement = (
	id: string,
	page: PageSize,
	src: ImageSource,
	natural: { widthPx: number; heightPx: number },
	name: string,
): ImageElement => {
	const scale = Math.min(
		IMAGE_MAX_SIDE_PT / natural.widthPx,
		IMAGE_MAX_SIDE_PT / natural.heightPx,
		1,
	);
	return {
		...centered(page, natural.widthPx * scale, natural.heightPx * scale),
		id,
		name,
		type: "image",
		src,
		fit: "contain",
	};
};

/** Paso de la rejilla donde se buscan huecos, y aire que se deja alrededor. */
const FREE_SPOT_STEP_PT = 12;

/**
 * Lleva un elemento recién creado a donde menos tape lo que ya hay y, entre
 * esas posiciones, a la más cercana a donde se creó (el centro). Si no hay
 * hueco libre, queda donde menos cubre en vez de encima del contenido.
 */
export const placeInFreeSpot = <T extends DesignElement>(
	element: T,
	others: readonly DesignElement[],
	page: PageSize,
): T => {
	const step = FREE_SPOT_STEP_PT;
	const boxes = others
		.filter((other) => !other.hidden)
		.map((other) => {
			const box = aabbOf(other);
			return {
				x: box.x - step / 2,
				y: box.y - step / 2,
				w: box.w + step,
				h: box.h + step,
			};
		});
	const covered = (x: number, y: number) =>
		boxes.reduce(
			(area, box) =>
				area +
				Math.max(
					0,
					Math.min(x + element.w, box.x + box.w) - Math.max(x, box.x),
				) *
					Math.max(
						0,
						Math.min(y + element.h, box.y + box.h) - Math.max(y, box.y),
					),
			0,
		);
	if (covered(element.x, element.y) === 0) return element;

	// ponytail: barrido O(rejilla × elementos), unos miles de cajas por inserción.
	let best = { x: element.x, y: element.y, area: Infinity, distance: 0 };
	for (let y = 0; y <= page.h - element.h; y += step)
		for (let x = 0; x <= page.w - element.w; x += step) {
			const area = covered(x, y);
			const distance = (x - element.x) ** 2 + (y - element.y) ** 2;
			if (area < best.area || (area === best.area && distance < best.distance))
				best = { x, y, area, distance };
		}
	return { ...element, x: roundPt(best.x), y: roundPt(best.y) };
};

/** QR y folio: se mueven y se estilizan, pero no se borran ni se duplican. */
export const isMandatory = (element: DesignElement): boolean =>
	element.type === "qr" || element.type === "folio";

/** Qué elementos guardan siempre su proporción al redimensionarse. */
export const keepsAspect = (element: DesignElement): boolean =>
	element.type === "qr" || element.type === "image";
