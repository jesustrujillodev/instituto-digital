import { describe, expect, test } from "vitest";
import { advanceOf, type FaceMetrics, metricsOf } from "../design/font-metrics";
import {
	layoutText,
	measureLine,
	TEXT_SAFETY_MARGIN,
} from "../design/text-layout";

// Métricas de juguete: cada carácter mide medio em, la «M» un em.
const MONO: FaceMetrics = {
	hash: "",
	ascent: 800,
	descent: 200,
	widths: Array.from({ length: 700 }, (_, index) =>
		index === 0x4d - 0x20 ? 1000 : 500,
	),
};

const base = {
	metrics: MONO,
	sizePt: 10,
	letterSpacing: 0,
	lineHeight: 1,
	boxWidthPt: 100,
	boxHeightPt: 100,
	fit: "wrap" as const,
	minSizePt: 4,
};

/** Ancho útil de la caja en caracteres de 5 pt a cuerpo 10. */
const usable = (box: number, size = 10) =>
	Math.floor((box * (1 - TEXT_SAFETY_MARGIN)) / (size / 2));

describe("measureLine", () => {
	test("suma avances y letter-spacing", () => {
		expect(measureLine("aa", MONO, 10, 0)).toBe(10);
		expect(measureLine("aa", MONO, 10, 0.1)).toBe(12);
	});

	test("lo que la tabla no tiene mide como una M", () => {
		expect(advanceOf(MONO, 0x4e00)).toBe(1000);
	});
});

describe("layoutText · wrap", () => {
	test("corta por palabras y no deja espacios al final", () => {
		const layout = layoutText({
			...base,
			text: "uno dos tres cuatro",
			boxWidthPt: 50,
		});
		expect(layout.lines.map((line) => line.text)).toEqual([
			"uno dos",
			"tres",
			"cuatro",
		]);
		expect(layout.sizePt).toBe(10);
	});

	test("respeta los saltos de línea y marca el fin de cada párrafo", () => {
		const layout = layoutText({ ...base, text: "a b\nc" });
		expect(layout.lines).toEqual([
			{ text: "a b", endsParagraph: true },
			{ text: "c", endsParagraph: true },
		]);
	});

	test("corta después de un guion", () => {
		const layout = layoutText({
			...base,
			text: "García-Márquez",
			boxWidthPt: 45,
		});
		expect(layout.lines.map((line) => line.text)).toEqual([
			"García-",
			"Márquez",
		]);
	});

	test("una palabra más larga que la caja se parte por caracteres", () => {
		const layout = layoutText({
			...base,
			text: "a".repeat(30),
			boxWidthPt: 50,
		});
		expect(layout.lines.every((line) => line.text.length <= usable(50))).toBe(
			true,
		);
		expect(layout.lines.map((line) => line.text).join("")).toBe("a".repeat(30));
	});

	test("un texto vacío es un renglón vacío", () => {
		expect(layoutText({ ...base, text: "" }).lines).toEqual([
			{ text: "", endsParagraph: true },
		]);
	});
});

describe("layoutText · shrink", () => {
	test("si cabe, no baja", () => {
		expect(layoutText({ ...base, fit: "shrink", text: "hola" }).sizePt).toBe(
			10,
		);
	});

	test("baja de medio en medio punto hasta caber en el alto", () => {
		const layout = layoutText({
			...base,
			fit: "shrink",
			text: "uno dos tres cuatro cinco seis",
			boxWidthPt: 60,
			boxHeightPt: 20,
		});
		expect(layout.sizePt).toBeLessThan(10);
		expect(layout.sizePt * 2).toBe(Math.round(layout.sizePt * 2));
		expect(layout.lines.length * layout.sizePt).toBeLessThanOrEqual(20);
	});

	test("prefiere bajar antes que partir una palabra", () => {
		const layout = layoutText({
			...base,
			fit: "shrink",
			text: "Villaseñor",
			boxWidthPt: 40,
			boxHeightPt: 40,
		});
		expect(layout.lines).toHaveLength(1);
	});

	test("en el mínimo recorta y cierra con puntos suspensivos", () => {
		const layout = layoutText({
			...base,
			fit: "shrink",
			minSizePt: 8,
			text: "uno dos tres cuatro cinco seis siete ocho",
			boxWidthPt: 40,
			boxHeightPt: 10,
		});
		expect(layout.sizePt).toBe(8);
		expect(layout.lines).toHaveLength(1);
		expect(layout.lines[0].text.endsWith("…")).toBe(true);
	});

	test("un mínimo mayor que el cuerpo se queda en el cuerpo", () => {
		const layout = layoutText({
			...base,
			fit: "shrink",
			minSizePt: 20,
			text: "hola",
		});
		expect(layout.sizePt).toBe(10);
	});
});

describe("métricas generadas", () => {
	test("cada cara del catálogo tiene métricas", () => {
		expect(metricsOf("avant-garde-400")).toBeDefined();
		expect(metricsOf("great-vibes-400")).toBeDefined();
		expect(metricsOf("no-existe")).toBeUndefined();
	});
});
