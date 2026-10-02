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
import { roundPt } from "./geometry";

// ===============================================================
// Elementos nuevos
// ===============================================================
// Lo que el editor inserta, centrado en la página. Puras: el id lo da quien
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

/** QR y folio: se mueven y se estilizan, pero no se borran ni se duplican. */
export const isMandatory = (element: DesignElement): boolean =>
	element.type === "qr" || element.type === "folio";

/** Qué elementos guardan siempre su proporción al redimensionarse. */
export const keepsAspect = (element: DesignElement): boolean =>
	element.type === "qr" || element.type === "image";
