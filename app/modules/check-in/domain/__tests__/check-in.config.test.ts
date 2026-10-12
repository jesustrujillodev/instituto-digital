import { describe, expect, test } from "vitest";
import { checkInRateKeyOf, checkInUserRateKeyOf } from "../check-in.config";

describe("checkInRateKeyOf", () => {
	test("agrupa por IP", () => {
		expect(checkInRateKeyOf("10.0.0.1")).toBe("check-in:10.0.0.1");
	});

	test("la cubeta por persona no se cruza con la de una IP", () => {
		expect(checkInUserRateKeyOf(7)).toBe("check-in:user:7");
	});
});
