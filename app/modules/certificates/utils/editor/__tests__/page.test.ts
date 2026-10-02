import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { PRESETS } from "../../../domain/design/design.presets";
import {
	type DesignElement,
	designV2Schema,
	type TextElement,
} from "../../../domain/design/design-v2.schema";
import { grownTextHeight, pageOf, resizePage, scaleGroup } from "../page";

const design = PRESETS.institucional;
const text = (patch: Partial<TextElement> = {}): TextElement => ({
	...(design.elements.find((e) => e.id === "otorga") as TextElement),
	fit: "wrap",
	w: 100,
	h: 20,
	sizePt: 12,
	lineHeight: 1.25,
	...patch,
});

describe("pageOf", () => {
	test("A4 y Carta en las dos orientaciones", () => {
		expect(pageOf("A4", "portrait")).toEqual({
			preset: "A4",
			orientation: "portrait",
			widthPt: 595.28,
			heightPt: 841.89,
		});
		expect(pageOf("LETTER", "landscape")).toMatchObject({
			widthPt: 792,
			heightPt: 612,
		});
	});
});

describe("resizePage", () => {
	test("lleva las posiciones en proporción y deja QR y folio dentro", () => {
		const next = resizePage(design, pageOf("A4", "portrait"));

		expect(next.page.orientation).toBe("portrait");
		expect(v.safeParse(designV2Schema, next).success).toBe(true);
		const before = design.elements.find(
			(e) => e.id === "franja",
		) as DesignElement;
		const after = next.elements.find((e) => e.id === "franja") as DesignElement;
		expect(after.w).toBe(before.w);
	});
});

describe("grownTextHeight", () => {
	test("crece para que quepan todos los renglones", () => {
		const grown = grownTextHeight(
			text({ content: "uno dos tres cuatro cinco seis siete ocho nueve diez" }),
		);
		expect(grown).toBeGreaterThan(20);
		expect((grown / (12 * 1.25)) % 1).toBeCloseTo(0, 5);
	});

	test("nunca encoge la caja", () => {
		expect(grownTextHeight(text({ content: "hola", h: 80 }))).toBe(80);
	});

	test("las mayúsculas cuentan al medir", () => {
		const lower = grownTextHeight(text({ content: "mmmm mmmm mmmm mmmm" }));
		const upper = grownTextHeight(
			text({ content: "mmmm mmmm mmmm mmmm", uppercase: true }),
		);
		expect(upper).toBeGreaterThanOrEqual(lower);
	});

	test("un texto que baja de cuerpo conserva su caja", () => {
		expect(
			grownTextHeight(text({ fit: "shrink", content: "x ".repeat(200) })),
		).toBe(20);
	});

	test("sin métricas para su cara, no cambia", () => {
		expect(
			grownTextHeight(text({ weight: 900, content: "x ".repeat(200) })),
		).toBe(20);
	});
});

describe("scaleGroup", () => {
	const el = (
		id: string,
		x: number,
		y: number,
		patch: Partial<DesignElement> = {},
	) =>
		({
			...design.elements[0],
			id,
			x,
			y,
			w: 10,
			h: 10,
			rotation: 0,
			locked: false,
			...patch,
		}) as DesignElement;

	test("escala posiciones y tamaños desde la caja del grupo", () => {
		const [a, b] = scaleGroup(
			[el("a", 0, 0), el("b", 30, 30)],
			{ x: 0, y: 0, w: 40, h: 40 },
			{ x: 0, y: 0, w: 80, h: 80 },
		);
		expect(a).toMatchObject({ x: 0, y: 0, w: 20, h: 20 });
		expect(b).toMatchObject({ x: 60, y: 60, w: 20, h: 20 });
	});

	test("los bloqueados no cambian y el QR sigue cuadrado y legible", () => {
		const qr = el("qr", 0, 0, {
			type: "qr",
			w: 60,
			h: 60,
		} as Partial<DesignElement>);
		const locked = el("l", 50, 50, { locked: true });
		const [scaledQr, kept] = scaleGroup(
			[qr, locked],
			{ x: 0, y: 0, w: 100, h: 100 },
			{ x: 0, y: 0, w: 50, h: 80 },
		);
		expect(scaledQr.w).toBe(scaledQr.h);
		expect(scaledQr.w).toBeGreaterThanOrEqual(56.7);
		expect(kept).toBe(locked);
	});
});
