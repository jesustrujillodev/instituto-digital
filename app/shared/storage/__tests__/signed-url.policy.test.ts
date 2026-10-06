import { describe, expect, test } from "vitest";
import { cacheTtlMsOf, isServable } from "../signed-url.policy";

const POLICY = { signTtlS: 600, minRemainingS: 240 };

describe("cacheTtlMsOf", () => {
	test("la caché guarda la firma solo mientras le quede el margen", () => {
		expect(cacheTtlMsOf(POLICY)).toBe(360_000);
	});
});

describe("isServable", () => {
	const entry = { url: "https://x", expiresAt: 1_000_000 };

	test("con el margen justo todavía se entrega", () => {
		expect(isServable(entry, 1_000_000 - 240_000, POLICY)).toBe(true);
	});

	test("un milisegundo menos ya no", () => {
		expect(isServable(entry, 1_000_000 - 239_999, POLICY)).toBe(false);
	});
});
