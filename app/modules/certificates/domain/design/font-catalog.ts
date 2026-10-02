/**
 * Tipografías del editor libre, auto-hospedadas en `public/font`.
 *
 * Cada archivo es inmutable: un certificado emitido se maqueta con las
 * métricas de las caras que nombra, así que cambiar una fuente es publicarla
 * con otro nombre de archivo y otro id, nunca reescribirla.
 */

export const FONT_IDS = [
	"avant-garde",
	"eb-garamond",
	"playfair",
	"cinzel",
	"great-vibes",
	"source-sans",
] as const;
export type FontId = (typeof FONT_IDS)[number];

export interface FontFaceEntry {
	weight: number;
	italic: boolean;
	/** Ruta pública del `.woff2`. */
	file: string;
}

export interface FontFamilyEntry {
	id: FontId;
	label: string;
	/** Nombre propio en el `@font-face`: no choca con las fuentes de la app. */
	cssFamily: string;
	fallback: "serif" | "sans-serif" | "cursive";
	faces: readonly FontFaceEntry[];
}

const AVANT_GARDE_FILES = [
	[200, "XLt"],
	[400, "Bk"],
	[500, "Md"],
	[600, "Demi"],
	[700, "Bold"],
] as const;

const certFace = (
	id: FontId,
	weight: number,
	italic = false,
): FontFaceEntry => ({
	weight,
	italic,
	file: `/font/cert/${id}-${weight}${italic ? "-italic" : ""}.v1.woff2`,
});

export const FONT_CATALOG: Record<FontId, FontFamilyEntry> = {
	"avant-garde": {
		id: "avant-garde",
		label: "Avant Garde (institucional)",
		cssFamily: "cert-avant-garde",
		fallback: "sans-serif",
		faces: AVANT_GARDE_FILES.map(([weight, file]) => ({
			weight,
			italic: false,
			file: `/font/ITCAvantGardeStd-${file}.woff2`,
		})),
	},
	"eb-garamond": {
		id: "eb-garamond",
		label: "EB Garamond",
		cssFamily: "cert-eb-garamond",
		fallback: "serif",
		faces: [
			certFace("eb-garamond", 400),
			certFace("eb-garamond", 600),
			certFace("eb-garamond", 700),
			certFace("eb-garamond", 400, true),
		],
	},
	playfair: {
		id: "playfair",
		label: "Playfair Display",
		cssFamily: "cert-playfair",
		fallback: "serif",
		faces: [
			certFace("playfair", 400),
			certFace("playfair", 700),
			certFace("playfair", 400, true),
		],
	},
	cinzel: {
		id: "cinzel",
		label: "Cinzel",
		cssFamily: "cert-cinzel",
		fallback: "serif",
		faces: [certFace("cinzel", 400), certFace("cinzel", 700)],
	},
	"great-vibes": {
		id: "great-vibes",
		label: "Great Vibes (caligráfica)",
		cssFamily: "cert-great-vibes",
		fallback: "cursive",
		faces: [certFace("great-vibes", 400)],
	},
	"source-sans": {
		id: "source-sans",
		label: "Source Sans 3",
		cssFamily: "cert-source-sans",
		fallback: "sans-serif",
		faces: [
			certFace("source-sans", 400),
			certFace("source-sans", 600),
			certFace("source-sans", 700),
		],
	},
};

/** Clave estable de una cara: `eb-garamond-400-italic`. */
export const faceKeyOf = (font: FontId, weight: number, italic: boolean) =>
	`${font}-${weight}${italic ? "-italic" : ""}`;

export const findFace = (
	font: FontId,
	weight: number,
	italic: boolean,
): FontFaceEntry | undefined =>
	FONT_CATALOG[font].faces.find(
		(face) => face.weight === weight && face.italic === italic,
	);

/** Cada cara del catálogo por su clave. */
export const ALL_FACES: ReadonlyMap<string, FontFaceEntry> = new Map(
	FONT_IDS.flatMap((font) =>
		FONT_CATALOG[font].faces.map(
			(face) => [faceKeyOf(font, face.weight, face.italic), face] as const,
		),
	),
);
