import { describe, expect, test } from "vitest";
import { applySecurityHeaders, SECURITY_HEADERS } from "../security-headers";

describe("applySecurityHeaders", () => {
	test("agrega HSTS y prohíbe enmarcar la app desde otro origen", () => {
		const headers = new Headers();

		applySecurityHeaders(headers);

		expect(headers.get("Strict-Transport-Security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(headers.get("Content-Security-Policy")).toBe(
			"frame-ancestors 'self'",
		);
		expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
		expect(Object.fromEntries(headers)).toEqual(
			Object.fromEntries(
				Object.entries(SECURITY_HEADERS).map(([name, value]) => [
					name.toLowerCase(),
					value,
				]),
			),
		);
	});

	test("respeta la que la ruta ya fijó", () => {
		const headers = new Headers({
			"Content-Security-Policy": "sandbox; default-src 'none'",
		});

		applySecurityHeaders(headers);

		expect(headers.get("Content-Security-Policy")).toBe(
			"sandbox; default-src 'none'",
		);
	});
});
