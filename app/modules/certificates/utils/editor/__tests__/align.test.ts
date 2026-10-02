import { describe, expect, test } from "vitest";
import { PRESETS } from "../../../domain/design/design.presets";
import type { DesignElement } from "../../../domain/design/design-v2.schema";
import { alignElements, distributeElements } from "../align";

const base = PRESETS.institucional.elements[0];
const el = (id: string, x: number, y: number, w = 10, h = 10, patch = {}) =>
	({
		...base,
		id,
		x,
		y,
		w,
		h,
		rotation: 0,
		locked: false,
		...patch,
	}) as DesignElement;

const page = { w: 800, h: 600 };
const pick = (elements: DesignElement[], id: string) =>
	elements.find((e) => e.id === id) as DesignElement;

describe("alignElements", () => {
	test("uno solo se alinea contra la página", () => {
		const aligned = alignElements([el("a", 50, 50)], ["a"], "center-x", page);
		expect(pick(aligned, "a").x).toBe(395);
		expect(
			pick(alignElements([el("a", 50, 50)], ["a"], "bottom", page), "a").y,
		).toBe(590);
	});

	test.each([
		["left", { a: 10, b: 10 }],
		["right", { a: 90, b: 90 }],
		["center-x", { a: 50, b: 50 }],
	] as const)("varios se alinean a %s de su caja", (alignment, expected) => {
		const aligned = alignElements(
			[el("a", 10, 0), el("b", 90, 50)],
			["a", "b"],
			alignment,
			page,
		);
		expect(pick(aligned, "a").x).toBe(expected.a);
		expect(pick(aligned, "b").x).toBe(expected.b);
	});

	test("arriba y al centro vertical", () => {
		const elements = [el("a", 0, 10), el("b", 0, 90)];
		expect(pick(alignElements(elements, ["a", "b"], "top", page), "b").y).toBe(
			10,
		);
		expect(
			pick(alignElements(elements, ["a", "b"], "center-y", page), "a").y,
		).toBe(50);
	});

	test("los bloqueados no se mueven", () => {
		const elements = [el("a", 10, 0, 10, 10, { locked: true }), el("b", 90, 0)];
		const aligned = alignElements(elements, ["a", "b"], "left", page);
		expect(pick(aligned, "a").x).toBe(10);
		expect(alignElements(elements, ["a"], "left", page)).toEqual(elements);
	});
});

describe("distributeElements", () => {
	test("reparte el espacio por igual entre tres o más", () => {
		const elements = [el("a", 0, 0), el("c", 100, 0), el("b", 30, 0)];
		const spread = distributeElements(elements, ["a", "b", "c"], "x");
		expect(pick(spread, "b").x).toBe(50);
		expect(pick(spread, "a").x).toBe(0);
		expect(pick(spread, "c").x).toBe(100);
	});

	test("también en vertical", () => {
		const elements = [el("a", 0, 0), el("b", 0, 70), el("c", 0, 100)];
		expect(
			pick(distributeElements(elements, ["a", "b", "c"], "y"), "b").y,
		).toBe(50);
	});

	test("con menos de tres no hace nada", () => {
		const elements = [el("a", 0, 0), el("b", 30, 0)];
		expect(distributeElements(elements, ["a", "b"], "x")).toEqual(elements);
	});
});
