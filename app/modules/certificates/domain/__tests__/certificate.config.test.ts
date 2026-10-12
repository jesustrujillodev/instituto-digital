import { describe, expect, test } from "vitest";
import { certificateVerifyRateKeyOf } from "../certificate.config";

describe("certificateVerifyRateKeyOf", () => {
	test("agrupa por IP", () => {
		expect(certificateVerifyRateKeyOf("10.0.0.1")).toBe(
			"certificate-verify:10.0.0.1",
		);
	});
});
