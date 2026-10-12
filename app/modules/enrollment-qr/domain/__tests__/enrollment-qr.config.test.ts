import { describe, expect, test } from "vitest";
import {
	enrollmentQrRateKeyOf,
	enrollmentQrUserRateKeyOf,
} from "../enrollment-qr.config";

describe("enrollmentQrRateKeyOf", () => {
	test("tiene su propia cubeta, separada de la de asistencia", () => {
		expect(enrollmentQrRateKeyOf("10.0.0.1")).toBe("enrollment-qr:10.0.0.1");
		expect(enrollmentQrUserRateKeyOf(7)).toBe("enrollment-qr:user:7");
	});
});
