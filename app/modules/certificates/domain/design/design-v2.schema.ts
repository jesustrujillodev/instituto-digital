import * as v from "valibot";
import { HEX_COLOR } from "./color";
import { unknownTokensOf } from "./design.tokens";
import {
	DESIGN_LIMITS,
	PAGE_SIDE_PT,
	QR_MIN_SIDE_PT,
} from "./design-v2.config";
import { FONT_IDS, findFace } from "./font-catalog";
import { aabbOf, isInside } from "./geometry";
import { BUILTIN_LOGO_IDS } from "./logos";

// ===============================================================
// Diseño v2: el editor libre (ADR 0028)
// ===============================================================
// Un documento de elementos colocados por coordenadas, en puntos PDF. El orden
// del arreglo es el orden de apilado: el primero queda al fondo.

const color = (field: string) =>
	v.pipe(
		v.string(`${field} debe ser texto.`),
		v.regex(HEX_COLOR, `${field} debe tener la forma #RRGGBB.`),
	);

const finite = (field: string, min: number, max: number) =>
	v.pipe(
		v.number(`${field} debe ser un número.`),
		v.finite(`${field} debe ser un número.`),
		v.minValue(min, `${field} no puede ser menor que ${min}.`),
		v.maxValue(max, `${field} no puede ser mayor que ${max}.`),
	);

const pageSide = (field: string) =>
	finite(field, PAGE_SIDE_PT.min, PAGE_SIDE_PT.max);

const baseEntries = {
	id: v.pipe(
		v.string("El identificador del elemento debe ser texto."),
		v.regex(/^[a-z0-9-]{1,40}$/, "El identificador del elemento no es válido."),
	),
	name: v.pipe(
		v.string("El nombre de la capa debe ser texto."),
		v.trim(),
		v.maxLength(
			DESIGN_LIMITS.name,
			`El nombre de la capa no puede superar los ${DESIGN_LIMITS.name} caracteres.`,
		),
	),
	x: finite(
		"La posición horizontal",
		-DESIGN_LIMITS.coordinate,
		DESIGN_LIMITS.coordinate,
	),
	y: finite(
		"La posición vertical",
		-DESIGN_LIMITS.coordinate,
		DESIGN_LIMITS.coordinate,
	),
	w: finite("El ancho", 1, DESIGN_LIMITS.coordinate),
	h: finite("El alto", 1, DESIGN_LIMITS.coordinate),
	rotation: finite("La rotación", -360, 360),
	opacity: finite("La opacidad", 0, 1),
	locked: v.boolean("Indica si la capa está bloqueada."),
	hidden: v.boolean("Indica si la capa está oculta."),
};

const typographyEntries = {
	fontId: v.picklist(FONT_IDS, "Elige una tipografía del catálogo."),
	weight: finite("El grosor", 100, 900),
	italic: v.boolean("Indica si el texto va en cursiva."),
	sizePt: finite(
		"El tamaño de letra",
		DESIGN_LIMITS.fontSizePt.min,
		DESIGN_LIMITS.fontSizePt.max,
	),
	color: color("El color del texto"),
	align: v.picklist(
		["left", "center", "right", "justify"],
		"Elige una alineación válida.",
	),
	letterSpacing: finite(
		"El espaciado entre letras",
		DESIGN_LIMITS.letterSpacing.min,
		DESIGN_LIMITS.letterSpacing.max,
	),
	uppercase: v.boolean("Indica si el texto va en mayúsculas."),
};

const hasFace = (element: {
	fontId: (typeof FONT_IDS)[number];
	weight: number;
	italic: boolean;
}) => findFace(element.fontId, element.weight, element.italic) !== undefined;

export const textElementSchema = v.pipe(
	v.object({
		...baseEntries,
		...typographyEntries,
		type: v.literal("text"),
		content: v.pipe(
			v.string("El texto debe ser texto."),
			v.maxLength(
				DESIGN_LIMITS.textContent,
				`El texto no puede superar los ${DESIGN_LIMITS.textContent} caracteres.`,
			),
			v.check(
				(content) => unknownTokensOf(content).length === 0,
				"El texto usa un campo dinámico que no existe.",
			),
		),
		vAlign: v.picklist(
			["top", "middle", "bottom"],
			"Elige una alineación vertical válida.",
		),
		lineHeight: finite(
			"El interlineado",
			DESIGN_LIMITS.lineHeight.min,
			DESIGN_LIMITS.lineHeight.max,
		),
		fit: v.picklist(["wrap", "shrink"], "Elige cómo se ajusta el texto."),
		minSizePt: finite(
			"El tamaño mínimo de letra",
			DESIGN_LIMITS.fontSizePt.min,
			DESIGN_LIMITS.fontSizePt.max,
		),
	}),
	v.check(
		(element) => hasFace(element),
		"La tipografía no tiene ese grosor o estilo.",
	),
);

export const folioElementSchema = v.pipe(
	v.object({
		...baseEntries,
		...typographyEntries,
		type: v.literal("folio"),
		label: v.pipe(
			v.string("La etiqueta del folio debe ser texto."),
			v.maxLength(
				DESIGN_LIMITS.folioLabel,
				`La etiqueta del folio no puede superar los ${DESIGN_LIMITS.folioLabel} caracteres.`,
			),
		),
	}),
	v.check(
		(element) => hasFace(element),
		"La tipografía no tiene ese grosor o estilo.",
	),
);

const nullableColor = (field: string) => v.nullable(color(field));

export const shapeElementSchema = v.object({
	...baseEntries,
	type: v.literal("shape"),
	kind: v.picklist(["rect", "ellipse", "line"], "Elige una forma válida."),
	fill: nullableColor("El relleno"),
	stroke: nullableColor("El borde"),
	strokeWidth: finite("El grosor del borde", 0, DESIGN_LIMITS.strokeWidthPt),
	cornerRadius: finite("El redondeo", 0, DESIGN_LIMITS.cornerRadiusPt),
});

const assetRef = v.pipe(
	v.string("La referencia de la imagen debe ser texto."),
	v.startsWith("/api/storage?", "La imagen debe estar subida a la plataforma."),
	v.maxLength(
		DESIGN_LIMITS.assetRef,
		"La referencia de la imagen es demasiado larga.",
	),
);

export const imageSourceSchema = v.variant(
	"kind",
	[
		v.object({
			kind: v.literal("logo"),
			logoId: v.union(
				[
					v.picklist(BUILTIN_LOGO_IDS, "El logo no es válido."),
					v.pipe(
						v.string("El logo no es válido."),
						v.uuid("El logo no es válido."),
					),
				],
				"El logo no es válido.",
			),
		}),
		v.object({
			kind: v.literal("asset"),
			ref: assetRef,
			role: v.picklist(["image", "signature"], "Elige el uso de la imagen."),
		}),
	],
	"La imagen no es válida.",
);

export const imageElementSchema = v.object({
	...baseEntries,
	type: v.literal("image"),
	src: imageSourceSchema,
	fit: v.picklist(["contain", "cover"], "Elige cómo se ajusta la imagen."),
});

export const qrElementSchema = v.pipe(
	v.object({
		...baseEntries,
		type: v.literal("qr"),
		color: color("El color del QR"),
	}),
	v.check((qr) => qr.w === qr.h, "El QR de verificación debe ser cuadrado."),
	v.check(
		(qr) => qr.w >= QR_MIN_SIDE_PT,
		"El QR de verificación debe medir al menos 2 cm para poder leerse.",
	),
	v.check(
		(qr) => qr.rotation % 90 === 0,
		"El QR de verificación solo gira en ángulos rectos.",
	),
	v.check(
		(qr) => qr.opacity === 1,
		"El QR de verificación no lleva transparencia.",
	),
);

export const designElementSchema = v.variant(
	"type",
	[
		textElementSchema,
		folioElementSchema,
		shapeElementSchema,
		imageElementSchema,
		qrElementSchema,
	],
	"El elemento no es válido.",
);

const pageSchema = v.object({
	preset: v.picklist(["A4", "LETTER", "CUSTOM"], "Elige un tamaño de página."),
	orientation: v.picklist(
		["landscape", "portrait"],
		"Elige la orientación de la página.",
	),
	widthPt: pageSide("El ancho de la página"),
	heightPt: pageSide("El alto de la página"),
});

const backgroundSchema = v.variant(
	"kind",
	[
		v.object({ kind: v.literal("color"), color: color("El color de fondo") }),
		v.object({
			kind: v.literal("pdf"),
			pdfRef: assetRef,
			rasterRef: assetRef,
			rasterDpi: finite("La resolución del fondo", 72, 300),
			widthPt: pageSide("El ancho del fondo"),
			heightPt: pageSide("El alto del fondo"),
		}),
	],
	"El fondo no es válido.",
);

type Element = v.InferOutput<typeof designElementSchema>;

const countOf = (elements: readonly Element[], type: Element["type"]) =>
	elements.filter((element) => element.type === type).length;

const mandatory = (elements: readonly Element[]) =>
	elements.filter(
		(element) => element.type === "qr" || element.type === "folio",
	);

export const designV2Schema = v.pipe(
	v.object({
		version: v.literal(2),
		page: pageSchema,
		background: backgroundSchema,
		elements: v.pipe(
			v.array(designElementSchema, "Los elementos no son válidos."),
			v.maxLength(
				DESIGN_LIMITS.elements,
				`El certificado no puede tener más de ${DESIGN_LIMITS.elements} elementos.`,
			),
		),
		folioFormat: v.pipe(
			v.string("El formato del folio debe ser texto."),
			v.trim(),
			v.maxLength(
				40,
				"El formato del folio no puede superar los 40 caracteres.",
			),
			v.includes("{seq}", "El formato del folio debe incluir {seq}."),
		),
	}),
	v.check(
		({ elements }) =>
			new Set(elements.map((element) => element.id)).size === elements.length,
		"Dos elementos no pueden tener el mismo identificador.",
	),
	v.check(
		({ elements }) => countOf(elements, "qr") === 1,
		"El certificado lleva exactamente un QR de verificación.",
	),
	v.check(
		({ elements }) => countOf(elements, "folio") === 1,
		"El certificado lleva exactamente un folio.",
	),
	v.check(
		({ elements }) => mandatory(elements).every((element) => !element.hidden),
		"El QR de verificación y el folio no se pueden ocultar.",
	),
	v.check(
		({ elements, page }) =>
			mandatory(elements).every((element) =>
				isInside(aabbOf(element), {
					x: 0,
					y: 0,
					w: page.widthPt,
					h: page.heightPt,
				}),
			),
		"El QR de verificación y el folio deben quedar dentro de la página.",
	),
	v.check(
		({ page, background }) =>
			background.kind !== "pdf" ||
			(Math.abs(background.widthPt - page.widthPt) < 0.01 &&
				Math.abs(background.heightPt - page.heightPt) < 0.01),
		"Con un PDF de fondo, la página mide lo mismo que el PDF.",
	),
);

export type CertificateDesignV2 = v.InferOutput<typeof designV2Schema>;
export type DesignElement = CertificateDesignV2["elements"][number];
export type TextElement = Extract<DesignElement, { type: "text" }>;
export type FolioElement = Extract<DesignElement, { type: "folio" }>;
export type ShapeElement = Extract<DesignElement, { type: "shape" }>;
export type ImageElement = Extract<DesignElement, { type: "image" }>;
export type QrElement = Extract<DesignElement, { type: "qr" }>;
export type DesignPage = CertificateDesignV2["page"];
export type DesignBackground = CertificateDesignV2["background"];
export type ImageSource = ImageElement["src"];
