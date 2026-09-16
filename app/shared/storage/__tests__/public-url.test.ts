import { describe, expect, test } from "vitest";
import { createAssetUrlResolver, toProxyRef } from "../public-url";

describe("createAssetUrlResolver — sin dominio público", () => {
	// REGRESIÓN: es el modo por defecto del proyecto (un bucket, todo por el
	// proxy). Si esto cambiara, cualquier despliegue sin CDN dejaría de servir
	// imágenes.
	test("everything resolves to the proxy reference", () => {
		const resolve = createAssetUrlResolver(null);

		expect(resolve("media/foto-1700000000.jpg")).toBe(
			"/api/storage?key=media%2Ffoto-1700000000.jpg",
		);
		expect(resolve("documentos/factura.pdf")).toBe(
			"/api/storage?key=documentos%2Ffactura.pdf",
		);
	});

	test("undefined and empty string behave like an absent domain", () => {
		expect(createAssetUrlResolver(undefined)("media/x.jpg")).toBe(
			toProxyRef("media/x.jpg"),
		);
		expect(createAssetUrlResolver("")("media/x.jpg")).toBe(
			toProxyRef("media/x.jpg"),
		);
	});
});

describe("createAssetUrlResolver — con dominio público", () => {
	const resolve = createAssetUrlResolver("https://cdn.ejemplo.com");

	test("CDN keys resolve to the public domain", () => {
		expect(resolve("media/foto-1700000000.jpg")).toBe(
			"https://cdn.ejemplo.com/media/foto-1700000000.jpg",
		);
	});

	// LO IMPORTANTE de esta prueba: tener dominio configurado no arrastra a los
	// prefijos privados. Los documentos siguen pasando por el proxy, que es quien
	// exige sesión — y además viven en otro bucket.
	test("non-CDN keys keep going through the proxy", () => {
		expect(resolve("documentos/factura.pdf")).toBe(
			"/api/storage?key=documentos%2Ffactura.pdf",
		);
		expect(resolve("profile-photos/ana.webp")).toBe(
			"/api/storage?key=profile-photos%2Fana.webp",
		);
	});

	test("trailing slashes in the domain do not double up", () => {
		const messy = createAssetUrlResolver("https://cdn.ejemplo.com///");
		expect(messy("media/foto.jpg")).toBe(
			"https://cdn.ejemplo.com/media/foto.jpg",
		);
	});

	// La key viaja como RUTA: sus `/` deben sobrevivir, pero cada segmento se
	// codifica. buildObjectKey ya sanea el nombre, así que esto cubre keys de
	// otra procedencia.
	test("the key travels as a path, with each segment encoded", () => {
		expect(resolve("media/sub/foto.jpg")).toBe(
			"https://cdn.ejemplo.com/media/sub/foto.jpg",
		);
		expect(resolve("media/foto con espacio.jpg")).toBe(
			"https://cdn.ejemplo.com/media/foto%20con%20espacio.jpg",
		);
	});

	test("http domains are accepted (local MinIO)", () => {
		expect(
			createAssetUrlResolver("http://localhost:9000/publico")("media/x.jpg"),
		).toBe("http://localhost:9000/publico/media/x.jpg");
	});
});
