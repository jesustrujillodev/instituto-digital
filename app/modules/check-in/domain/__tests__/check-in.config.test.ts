import { describe, expect, test } from "vitest";
import { checkInRateKeyOf } from "../check-in.config";

describe("checkInRateKeyOf", () => {
	test("agrupa por IP, y sin IP todo cae en la misma cubeta", () => {
		expect(checkInRateKeyOf("10.0.0.1")).toBe("check-in:10.0.0.1");
		expect(checkInRateKeyOf(undefined)).toBe("check-in:unknown");
	});
});
