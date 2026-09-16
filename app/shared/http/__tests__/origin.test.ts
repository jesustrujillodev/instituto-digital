import { describe, expect, test } from "vitest";
import { isTrustedOrigin, isWriteMethod } from "../origin";

const requestOf = (origin: string | null, url = "https://app.example.com/x") =>
	new Request(url, {
		headers: origin === null ? {} : { Origin: origin },
	});

describe("isTrustedOrigin", () => {
	test("trusts a request whose Origin matches the request host", () => {
		expect(isTrustedOrigin(requestOf("https://app.example.com"))).toBe(true);
	});

	// Es el caso que la capa existe para cortar: la página atacante no puede
	// falsificar Origin, así que un host distinto es una petición cross-site.
	test("rejects an Origin from another host", () => {
		expect(isTrustedOrigin(requestOf("https://evil.example.com"))).toBe(false);
	});

	test("rejects an Origin on the same host but a different port", () => {
		expect(
			isTrustedOrigin(
				requestOf("https://app.example.com:8443", "https://app.example.com/x"),
			),
		).toBe(false);
	});

	// Se compara el HOST, no el origin completo: un http→https del mismo host
	// sigue siendo la misma app detrás de un proxy que termina TLS.
	test("compares the host, so the scheme alone does not break trust", () => {
		expect(
			isTrustedOrigin(
				requestOf("http://app.example.com", "https://app.example.com/x"),
			),
		).toBe(true);
	});

	// Ausente ⇒ se permite: clientes no-navegador (curl, health checks) no lo
	// envían. Esta capa protege frente a navegadores, que sí lo mandan siempre en
	// peticiones no-GET cross-site.
	test("allows a request with no Origin header at all", () => {
		expect(isTrustedOrigin(requestOf(null))).toBe(true);
	});

	// El literal "null" lo manda un iframe sandbox o un documento data:. Nunca es
	// confiable, y no debe confundirse con la ausencia del header.
	test("rejects the literal string Origin: null", () => {
		expect(isTrustedOrigin(requestOf("null"))).toBe(false);
	});

	test("rejects a malformed Origin", () => {
		expect(isTrustedOrigin(requestOf("no-es-una-url"))).toBe(false);
	});
});

describe("isWriteMethod", () => {
	test("treats GET, HEAD and OPTIONS as safe", () => {
		expect(isWriteMethod("GET")).toBe(false);
		expect(isWriteMethod("HEAD")).toBe(false);
		expect(isWriteMethod("OPTIONS")).toBe(false);
	});

	test("treats every mutating verb as a write", () => {
		expect(isWriteMethod("POST")).toBe(true);
		expect(isWriteMethod("PUT")).toBe(true);
		expect(isWriteMethod("PATCH")).toBe(true);
		expect(isWriteMethod("DELETE")).toBe(true);
	});

	// El método llega tal cual de la petición: normalizar aquí evita que un
	// "post" en minúscula se cuele como si fuera seguro.
	test("is case-insensitive", () => {
		expect(isWriteMethod("get")).toBe(false);
		expect(isWriteMethod("post")).toBe(true);
	});
});
