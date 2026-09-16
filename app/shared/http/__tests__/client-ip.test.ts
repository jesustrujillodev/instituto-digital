import { describe, expect, test } from "vitest";
import { getClientIp } from "../client-ip";

const requestOf = (headers: Record<string, string>) =>
	new Request("https://app.example.com/x", { headers });

describe("getClientIp", () => {
	test("reads a single X-Forwarded-For value", () => {
		expect(getClientIp(requestOf({ "X-Forwarded-For": "203.0.113.7" }))).toBe(
			"203.0.113.7",
		);
	});

	// X-Forwarded-For es una lista "client, proxy1, proxy2": el cliente es el
	// primero; los siguientes son los saltos intermedios.
	test("takes the FIRST entry of the forwarded chain", () => {
		expect(
			getClientIp(
				requestOf({
					"X-Forwarded-For": "203.0.113.7, 70.41.3.18, 150.172.238.178",
				}),
			),
		).toBe("203.0.113.7");
	});

	test("trims the surrounding whitespace of the entry", () => {
		expect(
			getClientIp(
				requestOf({ "X-Forwarded-For": "  203.0.113.7 , 70.41.3.18" }),
			),
		).toBe("203.0.113.7");
	});

	test("accepts an IPv6 address", () => {
		expect(getClientIp(requestOf({ "X-Forwarded-For": "2001:db8::1" }))).toBe(
			"2001:db8::1",
		);
	});

	test("falls back to CF-Connecting-IP when there is no X-Forwarded-For", () => {
		expect(getClientIp(requestOf({ "CF-Connecting-IP": "198.51.100.4" }))).toBe(
			"198.51.100.4",
		);
	});

	// Cualquier cliente puede falsificar estos headers si no hay un proxy de
	// confianza delante. Validar el formato es lo que impide que un valor
	// arbitrario acabe persistido en la tabla de sesiones.
	test("falls back to CF-Connecting-IP when the forwarded value is not an IP", () => {
		expect(
			getClientIp(
				requestOf({
					"X-Forwarded-For": "<script>alert(1)</script>",
					"CF-Connecting-IP": "198.51.100.4",
				}),
			),
		).toBe("198.51.100.4");
	});

	test("returns undefined when both headers are invalid", () => {
		expect(
			getClientIp(
				requestOf({
					"X-Forwarded-For": "basura",
					"CF-Connecting-IP": "tambien",
				}),
			),
		).toBeUndefined();
	});

	test("returns undefined when no header is present", () => {
		expect(getClientIp(requestOf({}))).toBeUndefined();
	});

	test("returns undefined for an empty forwarded header", () => {
		expect(getClientIp(requestOf({ "X-Forwarded-For": "" }))).toBeUndefined();
	});
});
