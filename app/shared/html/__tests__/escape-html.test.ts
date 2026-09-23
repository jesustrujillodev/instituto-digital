import { describe, expect, test } from "vitest";
import { escapeHtml } from "../escape-html";

describe("escapeHtml", () => {
	test("una etiqueta sale como texto", () => {
		expect(escapeHtml("<script>alert(1)</script>")).toBe(
			"&lt;script&gt;alert(1)&lt;/script&gt;",
		);
	});

	test("las comillas no cierran un atributo", () => {
		expect(escapeHtml(`" onerror='x'`)).toBe("&quot; onerror=&#39;x&#39;");
	});

	// El & va primero: si no, el &lt; ya escapado se escaparía otra vez.
	test("el ampersand se escapa una sola vez", () => {
		expect(escapeHtml("Obras & Servicios <b>")).toBe(
			"Obras &amp; Servicios &lt;b&gt;",
		);
	});

	test("el texto sin caracteres especiales no cambia", () => {
		expect(escapeHtml("José Peña Núñez")).toBe("José Peña Núñez");
	});
});
