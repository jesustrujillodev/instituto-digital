import { describe, expect, test } from "vitest";
import { placeholderCountOf } from "../placeholders";

describe("placeholderCountOf", () => {
	test("conserva el alto de la página que se va", () => {
		expect(placeholderCountOf(7, 20)).toBe(7);
	});

	test("una lista vacía o corta enseña al menos tres", () => {
		expect(placeholderCountOf(0, 20)).toBe(3);
		expect(placeholderCountOf(1, 20)).toBe(3);
	});

	test("nunca más de lo que cabe en una página", () => {
		expect(placeholderCountOf(48, 12)).toBe(12);
		expect(placeholderCountOf(0, 2)).toBe(2);
	});
});
