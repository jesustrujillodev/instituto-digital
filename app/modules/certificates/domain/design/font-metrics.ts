import { FONT_METRICS } from "./font-metrics.generated";

/**
 * Rangos de Unicode con anchos medidos: Latin-1, Latin Extended-A, guiones,
 * comillas, puntos suspensivos, euro y marca registrada. Los mismos que
 * conserva `scripts/build-certificate-fonts.py` al recortar las fuentes.
 */
export const METRIC_RANGES: readonly (readonly [number, number])[] = [
	[0x20, 0x7e],
	[0xa0, 0x17f],
	[0x2010, 0x2027],
	[0x2030, 0x203a],
	[0x20ac, 0x20ac],
	[0x2122, 0x2122],
];

export interface FaceMetrics {
	/** sha256 del `.woff2`, para detectar un archivo cambiado. */
	hash: string;
	/** En milésimas de em. */
	ascent: number;
	descent: number;
	/** Avance por carácter de `METRIC_RANGES`, en milésimas de em; 0 si falta. */
	widths: readonly number[];
}

const rangeIndex = (codePoint: number): number => {
	let offset = 0;
	for (const [start, end] of METRIC_RANGES) {
		if (codePoint >= start && codePoint <= end)
			return offset + codePoint - start;
		offset += end - start + 1;
	}
	return -1;
};

const FALLBACK_CHAR = "M".codePointAt(0) as number;

/**
 * Avance de un carácter en milésimas de em. Lo que la tabla no tiene se mide
 * como una «M»: sobra espacio, nunca falta.
 */
export const advanceOf = (metrics: FaceMetrics, codePoint: number): number => {
	const index = rangeIndex(codePoint);
	const width = index >= 0 ? metrics.widths[index] : 0;
	return width > 0 ? width : metrics.widths[rangeIndex(FALLBACK_CHAR)];
};

export const metricsOf = (faceKey: string): FaceMetrics | undefined =>
	FONT_METRICS[faceKey];
