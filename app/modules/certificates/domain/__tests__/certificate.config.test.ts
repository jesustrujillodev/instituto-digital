import { describe, expect, test } from "vitest";
import { certificateVerifyRateKeyOf } from "../certificate.config";

describe("certificateVerifyRateKeyOf", () => {
	test("agrupa por IP, y sin IP todo cae en la misma cubeta", () => {
		expect(certificateVerifyRateKeyOf("10.0.0.1")).toBe(
			"certificate-verify:10.0.0.1",
		);
		expect(certificateVerifyRateKeyOf(undefined)).toBe(
			"certificate-verify:unknown",
		);
	});
});
