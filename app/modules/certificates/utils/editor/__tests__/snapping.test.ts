import { describe, expect, test } from "vitest";
import { SAFE_MARGIN_PT } from "../../../domain/design/design-v2.config";
import { snapMove } from "../snapping";

const page = { w: 800, h: 600 };

describe("snapMove", () => {
	test("el centro de la caja se ajusta al centro de la página", () => {
		const result = snapMove({ x: 347, y: 10, w: 100, h: 40 }, [], page, 5);
		expect(result.dx).toBe(3);
		expect(result.guides).toContainEqual({
			axis: "x",
			at: 400,
			from: 0,
			to: 600,
		});
	});

	test("un borde se ajusta al margen de seguridad", () => {
		const result = snapMove(
			{ x: 120, y: SAFE_MARGIN_PT + 2, w: 100, h: 40 },
			[],
			page,
			5,
		);
		expect(result.dy).toBe(-2);
	});

	test("se ajusta a los bordes de otro elemento y extiende la guía hasta él", () => {
		const other = { x: 500, y: 300, w: 100, h: 100 };
		const result = snapMove({ x: 497, y: 100, w: 50, h: 50 }, [other], page, 5);
		expect(result.dx).toBe(3);
		expect(result.guides).toContainEqual({
			axis: "x",
			at: 500,
			from: 100,
			to: 400,
		});
	});

	test("elige el ajuste más cercano", () => {
		const result = snapMove({ x: 396, y: 100, w: 10, h: 10 }, [], page, 10);
		// El centro (401) está a 1 de 400; el borde izquierdo a 4.
		expect(result.dx).toBe(-1);
	});

	test("fuera del umbral no se mueve ni pinta guías", () => {
		expect(snapMove({ x: 200, y: 200, w: 33, h: 33 }, [], page, 2)).toEqual({
			dx: 0,
			dy: 0,
			guides: [],
		});
	});
});

test("dos destinos en la misma línea pintan una sola guía", () => {
	const twin = { x: 395, y: 0, w: 10, h: 600 };
	const result = snapMove(
		{ x: 350, y: 0, w: 100, h: 600 },
		[twin, twin],
		{ w: 800, h: 600 },
		5,
	);
	const vertical = result.guides.filter((guide) => guide.axis === "x");
	expect(new Set(vertical.map((g) => `${g.at}:${g.from}:${g.to}`)).size).toBe(
		vertical.length,
	);
});
