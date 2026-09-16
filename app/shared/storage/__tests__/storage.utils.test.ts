import { describe, expect, test } from "vitest";
import { getKeyFromUrl } from "../storage.utils";

describe("getKeyFromUrl", () => {
	test("extracts the key from the proxy reference", () => {
		expect(getKeyFromUrl("/api/storage?key=profile-photos/ana.png")).toBe(
			"profile-photos/ana.png",
		);
	});

	// La key viaja url-encoded en el query string; hay que devolverla decodificada
	// o el proveedor buscaría un objeto con "%2F" en el nombre.
	test("decodes a percent-encoded key", () => {
		expect(
			getKeyFromUrl("/api/storage?key=profile-photos%2Fana%20ruiz.png"),
		).toBe("profile-photos/ana ruiz.png");
	});

	test("survives extra query params", () => {
		expect(getKeyFromUrl("/api/storage?inline=true&key=documents/x.pdf")).toBe(
			"documents/x.pdf",
		);
	});

	test("returns null for a proxy reference with no key", () => {
		expect(getKeyFromUrl("/api/storage?inline=true")).toBeNull();
		expect(getKeyFromUrl("/api/storage?key=")).toBeNull();
	});

	// Tolera que le pasen la key ya cruda: el proxy acepta ambas formas y así el
	// llamador no tiene que saber cuál guardó la base.
	test("returns a raw key untouched", () => {
		expect(getKeyFromUrl("profile-photos/ana.png")).toBe(
			"profile-photos/ana.png",
		);
	});

	// El formato legado de URL completa del proveedor NO se soporta: este proyecto
	// nace guardando siempre la referencia proxy, así que una URL de S3 es un dato
	// que no debería existir y se rechaza en vez de intentar adivinar la key.
	test("returns null for a full provider URL", () => {
		expect(
			getKeyFromUrl("https://bucket.s3.eu-west-1.amazonaws.com/x.png"),
		).toBeNull();
		expect(getKeyFromUrl("http://localhost:9000/bucket/x.png")).toBeNull();
	});

	test("returns null for an empty string", () => {
		expect(getKeyFromUrl("")).toBeNull();
	});
});
