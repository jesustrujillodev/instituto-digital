import { describe, expect, test } from "vitest";
import { signatureSizeOf } from "../resize-signature-image";

describe("signatureSizeOf", () => {
	test("una firma más ancha que el tope se reduce conservando la proporción", () => {
		expect(signatureSizeOf(1600, 400, 800)).toEqual({
			width: 800,
			height: 200,
		});
	});

	test("una firma pequeña no se amplía", () => {
		expect(signatureSizeOf(300, 90, 800)).toEqual({ width: 300, height: 90 });
	});

	test("una firma muy apaisada no queda con alto cero", () => {
		expect(signatureSizeOf(10000, 1, 800).height).toBe(1);
	});
});
