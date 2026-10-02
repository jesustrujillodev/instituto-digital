import { describe, expect, test } from "vitest";
import { fittedSizeOf } from "../image-size";

describe("fittedSizeOf", () => {
	test("reduce por el lado mayor conservando la proporción", () => {
		expect(fittedSizeOf(4800, 1200, 2400)).toEqual({
			width: 2400,
			height: 600,
		});
		expect(fittedSizeOf(1000, 3000, 1200)).toEqual({
			width: 400,
			height: 1200,
		});
	});

	test("una imagen pequeña no se amplía", () => {
		expect(fittedSizeOf(300, 90, 800)).toEqual({ width: 300, height: 90 });
	});

	test("nunca deja un lado en cero", () => {
		expect(fittedSizeOf(10000, 1, 100)).toEqual({ width: 100, height: 1 });
	});
});
