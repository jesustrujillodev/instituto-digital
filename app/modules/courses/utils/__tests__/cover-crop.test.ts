import { describe, expect, test } from "vitest";
import { computeCoverCrop } from "../cover-crop";

const RATIO = 16 / 9;

describe("computeCoverCrop", () => {
	test("una imagen más ancha que 16:9 se recorta por los lados", () => {
		const crop = computeCoverCrop(4000, 1000, RATIO, 1600);

		expect(crop.sourceHeight).toBe(1000);
		expect(crop.sourceWidth).toBeCloseTo(1000 * RATIO);
		// Centrado: sobra lo mismo a izquierda y derecha.
		expect(crop.sourceX).toBeCloseTo((4000 - 1000 * RATIO) / 2);
		expect(crop.sourceY).toBe(0);
	});

	test("una foto vertical se recorta por arriba y por abajo", () => {
		const crop = computeCoverCrop(1080, 1920, RATIO, 1600);

		expect(crop.sourceWidth).toBe(1080);
		expect(crop.sourceHeight).toBeCloseTo(1080 / RATIO);
		expect(crop.sourceX).toBe(0);
		expect(crop.sourceY).toBeCloseTo((1920 - 1080 / RATIO) / 2);
	});

	test("una cuadrada se recorta solo en vertical", () => {
		const crop = computeCoverCrop(1200, 1200, RATIO, 1600);

		expect(crop.sourceWidth).toBe(1200);
		expect(crop.sourceX).toBe(0);
		expect(crop.sourceY).toBeGreaterThan(0);
	});

	test("el lienzo de salida siempre queda en la proporción pedida", () => {
		for (const [width, height] of [
			[4000, 1000],
			[1080, 1920],
			[1200, 1200],
			[640, 360],
		]) {
			const crop = computeCoverCrop(width, height, RATIO, 1600);

			expect(crop.width / crop.height).toBeCloseTo(RATIO, 1);
		}
	});

	test("nunca amplía: una imagen pequeña se sube a su tamaño real", () => {
		// Interpolar hasta 1600 px inventa nitidez que la imagen no tiene y pesa
		// más que el original.
		const crop = computeCoverCrop(800, 450, RATIO, 1600);

		expect(crop.width).toBe(800);
		expect(crop.height).toBe(450);
	});

	test("recorta al objetivo cuando la imagen da de sobra", () => {
		const crop = computeCoverCrop(4000, 3000, RATIO, 1600);

		expect(crop.width).toBe(1600);
		expect(crop.height).toBe(900);
	});
});
