/**
 * Medidas del diseño v2, en puntos PDF (1/72 de pulgada): el tamaño de página
 * es exacto y un PDF de fondo se superpone sin escalar.
 */

export const PAGE_PRESETS = {
	A4: { widthPt: 841.89, heightPt: 595.28, label: "A4" },
	LETTER: { widthPt: 792, heightPt: 612, label: "Carta" },
} as const;
export type PagePreset = keyof typeof PAGE_PRESETS | "CUSTOM";

/** De poco más de A7 a A3 por lado: lo que un fondo PDF razonable mide. */
export const PAGE_SIDE_PT = { min: 200, max: 1191 } as const;

export const PT_PER_INCH = 72;
export const CSS_PX_PER_PT = 96 / PT_PER_INCH;

export const DESIGN_LIMITS = {
	elements: 150,
	name: 60,
	textContent: 1000,
	folioLabel: 40,
	assetRef: 500,
	/** Un elemento puede sangrar, pero no perderse lejos de la página. */
	coordinate: PAGE_SIDE_PT.max * 2,
	fontSizePt: { min: 4, max: 200 },
	lineHeight: { min: 0.8, max: 3 },
	letterSpacing: { min: -0.1, max: 1 },
	strokeWidthPt: 50,
	cornerRadiusPt: 500,
} as const;

/** 2 cm impresos: lo menos que un teléfono lee sin acercarse demasiado. */
export const QR_MIN_SIDE_PT = 56.7;

/** Margen de seguridad de impresión que el editor marca y al que se ajusta. */
export const SAFE_MARGIN_PT = 18;

export const BACKGROUND_DEFAULT_COLOR = "#ffffff";
