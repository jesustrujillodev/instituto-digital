import { describe, expect, test } from "vitest";
import {
	bucketForKey,
	CDN_CACHE_CONTROL,
	CDN_PREFIXES,
	cacheControlForKey,
	isCdnKey,
	isPublicKey,
	PRIVATE_CACHE_CONTROL,
	PUBLIC_PREFIXES,
} from "../storage.policy";

describe("isPublicKey", () => {
	test("recognises the public prefixes", () => {
		expect(isPublicKey("profile-photos/ana-1700000000.webp")).toBe(true);
		expect(isPublicKey("media/foto-1700000000.jpg")).toBe(true);
	});

	// Fail-closed: todo lo que no empiece por un prefijo público es privado y el
	// proxy exigirá sesión. Un objeto nuevo es privado por omisión, no público por
	// descuido.
	test("anything else is private by default", () => {
		expect(isPublicKey("documents/contrato.pdf")).toBe(false);
		expect(isPublicKey("cualquier-cosa.png")).toBe(false);
		expect(isPublicKey("")).toBe(false);
	});

	// startsWith, no includes: si bastara con contener el prefijo, un
	// "documents/../profile-photos/x" o un "privado/profile-photos/x" se serviría
	// sin sesión.
	test("the prefix must be at the START of the key", () => {
		expect(isPublicKey("privado/profile-photos/secreto.png")).toBe(false);
		expect(isPublicKey("x-media/foto.jpg")).toBe(false);
	});

	// El separador forma parte del prefijo: un bucket "profile-photos-privados/"
	// no hereda el acceso público de "profile-photos/".
	test("a sibling prefix without the slash is not public", () => {
		expect(isPublicKey("profile-photos-privados/x.png")).toBe(false);
		expect(isPublicKey("profile-photos")).toBe(false);
	});

	test("the check is case-sensitive", () => {
		expect(isPublicKey("Profile-Photos/ana.png")).toBe(false);
	});
});

describe("isCdnKey", () => {
	test("only the catalog prefix is served by the CDN", () => {
		expect(isCdnKey("media/foto-1700000000.jpg")).toBe(true);
		expect(isCdnKey("profile-photos/ana-1700000000.webp")).toBe(false);
		expect(isCdnKey("documentos/factura.pdf")).toBe(false);
	});

	// Mismas trampas que isPublicKey: el prefijo se compara al INICIO y con su
	// separador, o "x-media/" heredaría el acceso de un dominio abierto.
	test("the prefix must be at the START and include the slash", () => {
		expect(isCdnKey("privado/media/secreto.jpg")).toBe(false);
		expect(isCdnKey("x-media/foto.jpg")).toBe(false);
		expect(isCdnKey("media")).toBe(false);
	});
});

// EL invariante del módulo. Un objeto servido por un dominio abierto no puede
// exigir sesión: si un prefijo entrara en CDN_PREFIXES sin estar en
// PUBLIC_PREFIXES, el proxy pediría login para algo que Cloudflare ya está
// sirviendo a cualquiera. Esta prueba es lo que impide que ocurra en silencio.
describe("CDN_PREFIXES ⊆ PUBLIC_PREFIXES", () => {
	test("every CDN prefix is also a public prefix", () => {
		for (const prefix of CDN_PREFIXES) {
			expect(PUBLIC_PREFIXES).toContain(prefix);
		}
	});

	test("a CDN key is always a public key", () => {
		for (const prefix of CDN_PREFIXES) {
			expect(isPublicKey(`${prefix}archivo.bin`)).toBe(true);
		}
	});
});

describe("bucketForKey", () => {
	const buckets = { defaultBucket: "privado", publicBucket: "publico" };

	test("sends CDN keys to the public bucket and the rest to the default one", () => {
		expect(bucketForKey("media/foto.jpg", buckets)).toBe("publico");
		expect(bucketForKey("documentos/factura.pdf", buckets)).toBe("privado");
		// Público para el proxy, pero NO del CDN: sigue en el bucket privado.
		expect(bucketForKey("profile-photos/ana.webp", buckets)).toBe("privado");
	});

	// Un modulo puede subir a una carpeta por dueno. La politica decide por el
	// INICIO de la key, asi que la carpeta no puede cambiar ni bucket ni
	// visibilidad: lo privado sigue privado aunque comparta nombre de carpeta.
	test("a per-owner folder keeps the bucket and visibility of its prefix", () => {
		const photo = "media/curso-induccion-2026/portada-1700000000.jpg";
		const document =
			"documentos/curso-induccion-2026/constancia-1700000000.pdf";

		expect(bucketForKey(photo, buckets)).toBe("publico");
		expect(isPublicKey(photo)).toBe(true);
		expect(cacheControlForKey(photo)).toBe(CDN_CACHE_CONTROL);

		expect(bucketForKey(document, buckets)).toBe("privado");
		expect(isPublicKey(document)).toBe(false);
		expect(cacheControlForKey(document)).toBe(PRIVATE_CACHE_CONTROL);
	});

	// El modo de un solo bucket es el POR DEFECTO del proyecto: sin bucket
	// público todo aterriza en el de siempre y el comportamiento no cambia.
	test("without a public bucket everything goes to the default one", () => {
		const single = { defaultBucket: "privado" };
		expect(bucketForKey("media/foto.jpg", single)).toBe("privado");
		expect(bucketForKey("documentos/factura.pdf", single)).toBe("privado");
		expect(
			bucketForKey("media/foto.jpg", { ...single, publicBucket: null }),
		).toBe("privado");
	});
});

describe("cacheControlForKey", () => {
	// Las keys llevan timestamp (buildObjectKey), así que un objeto del CDN nunca
	// cambia de contenido y puede cachearse un año. Sin esta cabecera el CDN
	// cachearía mal y todo el cambio no serviría de nada.
	test("CDN objects are immutable for a year", () => {
		expect(cacheControlForKey("media/foto-1700000000.jpg")).toBe(
			CDN_CACHE_CONTROL,
		);
		expect(CDN_CACHE_CONTROL).toContain("immutable");
	});

	test("everything else is never cached", () => {
		expect(cacheControlForKey("documentos/factura.pdf")).toBe(
			PRIVATE_CACHE_CONTROL,
		);
		expect(cacheControlForKey("profile-photos/ana.webp")).toBe(
			PRIVATE_CACHE_CONTROL,
		);
		expect(PRIVATE_CACHE_CONTROL).toContain("no-store");
	});
});
