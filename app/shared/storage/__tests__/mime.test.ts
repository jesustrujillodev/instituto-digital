import { describe, expect, test } from "vitest";
import { contentTypeForKey } from "../mime";

describe("contentTypeForKey", () => {
	test("resolves the image types", () => {
		expect(contentTypeForKey("a.png")).toBe("image/png");
		expect(contentTypeForKey("a.jpg")).toBe("image/jpeg");
		expect(contentTypeForKey("a.jpeg")).toBe("image/jpeg");
		expect(contentTypeForKey("a.webp")).toBe("image/webp");
		expect(contentTypeForKey("a.avif")).toBe("image/avif");
		expect(contentTypeForKey("a.gif")).toBe("image/gif");
		expect(contentTypeForKey("a.svg")).toBe("image/svg+xml");
		expect(contentTypeForKey("a.bmp")).toBe("image/bmp");
		expect(contentTypeForKey("a.ico")).toBe("image/x-icon");
	});

	test("resolves the document types", () => {
		expect(contentTypeForKey("a.pdf")).toBe("application/pdf");
		expect(contentTypeForKey("a.doc")).toBe("application/msword");
		expect(contentTypeForKey("a.docx")).toBe(
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		);
		expect(contentTypeForKey("a.xls")).toBe("application/vnd.ms-excel");
		expect(contentTypeForKey("a.xlsx")).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		expect(contentTypeForKey("a.csv")).toBe("text/csv");
		expect(contentTypeForKey("a.txt")).toBe("text/plain");
		expect(contentTypeForKey("a.json")).toBe("application/json");
	});

	// Las keys llevan el nombre original sanitizado, que puede venir en mayúsculas
	// de un móvil o de Windows.
	test("is case-insensitive on the extension", () => {
		expect(contentTypeForKey("FOTO.PNG")).toBe("image/png");
		expect(contentTypeForKey("Documento.PdF")).toBe("application/pdf");
	});

	test("resolves the extension of a full key with its prefix", () => {
		expect(contentTypeForKey("profile-photos/ana-1700000000.webp")).toBe(
			"image/webp",
		);
	});

	// Solo cuenta el ÚLTIMO punto: un "informe.v2.pdf" es un PDF, no un ".v2".
	test("uses the last dot of the key", () => {
		expect(contentTypeForKey("informe.v2.pdf")).toBe("application/pdf");
	});

	// Fail-safe: un tipo desconocido se sirve como binario opaco en vez de
	// adivinar. Con Content-Disposition inline, adivinar "text/html" sobre un
	// archivo subido por un usuario sería un XSS almacenado.
	test("falls back to octet-stream for an unknown extension", () => {
		expect(contentTypeForKey("a.exe")).toBe("application/octet-stream");
		expect(contentTypeForKey("a.")).toBe("application/octet-stream");
	});

	test("falls back to octet-stream when there is no dot at all", () => {
		expect(contentTypeForKey("sin-extension")).toBe("application/octet-stream");
		expect(contentTypeForKey("")).toBe("application/octet-stream");
	});
});
