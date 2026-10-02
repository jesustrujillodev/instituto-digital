import { advanceOf, type FaceMetrics } from "./font-metrics";

/**
 * Margen contra lo que la tabla no ve: kerning, ligaduras y el redondeo de
 * cada navegador. Con kerning activo, un nombre real mide hasta ~2 % más que
 * la suma de sus avances; se mide un 3 % de ancho menos del que la caja tiene.
 */
export const TEXT_SAFETY_MARGIN = 0.03;

/** Paso con el que `shrink` baja el cuerpo. */
export const SHRINK_STEP_PT = 0.5;

const ELLIPSIS = "…";

export interface TextLayoutInput {
	text: string;
	metrics: FaceMetrics;
	sizePt: number;
	/** En em, como `letter-spacing` de CSS: se suma tras cada carácter. */
	letterSpacing: number;
	/** Múltiplo del cuerpo. */
	lineHeight: number;
	boxWidthPt: number;
	boxHeightPt: number;
	fit: "wrap" | "shrink";
	minSizePt: number;
}

export interface TextLine {
	text: string;
	/** Último renglón de su párrafo: no se justifica. */
	endsParagraph: boolean;
}

export interface TextLayout {
	sizePt: number;
	lines: TextLine[];
}

/** Ancho de una línea en pt, letter-spacing incluido. */
export const measureLine = (
	line: string,
	metrics: FaceMetrics,
	sizePt: number,
	letterSpacing: number,
): number => {
	let width = 0;
	for (const char of line) {
		width +=
			(advanceOf(metrics, char.codePointAt(0) as number) / 1000) * sizePt +
			letterSpacing * sizePt;
	}
	return width;
};

/** Trozos que se pueden separar: palabras con su espacio, cortes tras guion. */
const breakableChunks = (paragraph: string): string[] =>
	paragraph.match(/[^\s-]*-|[^\s-]+\s*|\s+/g) ?? [];

/** Parte por caracteres una palabra que no cabe sola en el renglón. */
const splitByChars = (word: string, fits: (s: string) => boolean): string[] => {
	const parts: string[] = [];
	let current = "";
	for (const char of word) {
		if (current && !fits(current + char)) {
			parts.push(current);
			current = char;
		} else {
			current += char;
		}
	}
	if (current) parts.push(current);
	return parts;
};

interface Wrapped {
	lines: string[];
	/** Hubo que partir una palabra por caracteres. */
	brokeWord: boolean;
}

const wrapParagraph = (
	paragraph: string,
	fits: (s: string) => boolean,
): Wrapped => {
	const lines: string[] = [];
	let brokeWord = false;
	let current = "";

	for (const chunk of breakableChunks(paragraph)) {
		const candidate = current + chunk;
		if (fits(candidate.trimEnd())) {
			current = candidate;
			continue;
		}
		if (current.trim()) lines.push(current.trimEnd());
		current = "";

		const word = chunk.trimStart();
		if (fits(word.trimEnd())) {
			current = word;
			continue;
		}
		brokeWord = true;
		const parts = splitByChars(word.trimEnd(), fits);
		lines.push(...parts.slice(0, -1));
		current = parts.at(-1) ?? "";
	}
	lines.push(current.trimEnd());
	return { lines, brokeWord };
};

interface WrappedText {
	lines: TextLine[];
	brokeWord: boolean;
}

const wrapText = (text: string, fits: (s: string) => boolean): WrappedText => {
	const wrapped = text.split("\n").map((p) => wrapParagraph(p, fits));
	return {
		lines: wrapped.flatMap((w) =>
			w.lines.map((line, index) => ({
				text: line,
				endsParagraph: index === w.lines.length - 1,
			})),
		),
		brokeWord: wrapped.some((w) => w.brokeWord),
	};
};

/** Recorta al número de renglones que caben y cierra el último con «…». */
const clampLines = (
	lines: TextLine[],
	maxLines: number,
	fits: (s: string) => boolean,
): TextLine[] => {
	if (lines.length <= maxLines) return lines;
	const kept = lines.slice(0, Math.max(1, maxLines));
	let last = kept[kept.length - 1].text;
	while (last && !fits(`${last}${ELLIPSIS}`)) last = last.slice(0, -1);
	kept[kept.length - 1] = {
		text: `${last.trimEnd()}${ELLIPSIS}`,
		endsParagraph: true,
	};
	return kept;
};

/**
 * Parte el texto en renglones y, con `shrink`, baja el cuerpo hasta que quepa
 * en la caja.
 *
 * Es puro y lo usan por igual el editor y la exportación: el navegador recibe
 * los renglones ya cortados (`white-space: pre`) y nunca decide un corte, así
 * que la vista previa y el archivo no pueden partir distinto.
 */
export const layoutText = (input: TextLayoutInput): TextLayout => {
	const usableWidth = input.boxWidthPt * (1 - TEXT_SAFETY_MARGIN);
	const lineBox = (size: number) => size * input.lineHeight;
	const fitsAt = (size: number) => (line: string) =>
		measureLine(line, input.metrics, size, input.letterSpacing) <= usableWidth;

	if (input.fit === "wrap") {
		return {
			sizePt: input.sizePt,
			lines: wrapText(input.text, fitsAt(input.sizePt)).lines,
		};
	}

	const minSize = Math.min(input.minSizePt, input.sizePt);
	for (
		let size = input.sizePt;
		size >= minSize;
		size = Math.round((size - SHRINK_STEP_PT) * 100) / 100
	) {
		const wrapped = wrapText(input.text, fitsAt(size));
		const height = wrapped.lines.length * lineBox(size);
		if (!wrapped.brokeWord && height <= input.boxHeightPt) {
			return { sizePt: size, lines: wrapped.lines };
		}
	}

	const fits = fitsAt(minSize);
	const maxLines = Math.floor(input.boxHeightPt / lineBox(minSize));
	return {
		sizePt: minSize,
		lines: clampLines(wrapText(input.text, fits).lines, maxLines, fits),
	};
};
