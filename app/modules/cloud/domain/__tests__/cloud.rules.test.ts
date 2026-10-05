import { describe, expect, test } from "vitest";
import { CLOUD_LIMITS } from "../cloud.config";
import {
	isOrphanObject,
	validateCloudKey,
	validateCloudList,
	validateCloudPath,
	validateCloudSelection,
} from "../cloud.rules";

describe("validateCloudKey", () => {
	test("acepta una key de material", () => {
		expect(
			validateCloudKey("media/curso-induccion-2026/frente-1700000000.jpg"),
		).toBe("media/curso-induccion-2026/frente-1700000000.jpg");
	});

	test.each([
		"",
		"/media/a.jpg",
		"media/../documentos/factura.pdf",
		"media/./a.jpg",
		"media//a.jpg",
		"media/",
		"media/a\n.jpg",
		"a".repeat(1025),
	])("rechaza %j", (key) => {
		expect(() => validateCloudKey(key)).toThrow();
	});
});

describe("validateCloudPath", () => {
	test("la raíz es una carpeta listable", () => {
		expect(validateCloudPath("")).toBe("");
	});

	test("una carpeta acaba en /", () => {
		expect(validateCloudPath("media/cursos/")).toBe("media/cursos/");
		expect(() => validateCloudPath("media/cursos")).toThrow();
	});

	test("rechaza el path traversal", () => {
		expect(() => validateCloudPath("media/../")).toThrow();
	});
});

describe("validateCloudList", () => {
	test("el cursor es opcional", () => {
		expect(validateCloudList({ path: "media/" })).toEqual({
			path: "media/",
		});
	});
});

describe("validateCloudSelection", () => {
	test("acepta keys y carpetas", () => {
		const selection = {
			keys: ["media/a.jpg"],
			prefixes: ["media/cursos/"],
		};

		expect(validateCloudSelection(selection)).toEqual(selection);
	});

	test("una selección vacía no es válida", () => {
		expect(() => validateCloudSelection({ keys: [], prefixes: [] })).toThrow();
	});

	// Borrar o descargar el bucket entero no puede estar a un clic.
	test("la raíz no se puede seleccionar como carpeta", () => {
		expect(() =>
			validateCloudSelection({ keys: [], prefixes: [""] }),
		).toThrow();
	});

	test("topa el tamaño del lote", () => {
		const keys = Array.from({ length: 501 }, (_, index) => `k/${index}.jpg`);

		expect(() => validateCloudSelection({ keys, prefixes: [] })).toThrow();
	});
});

describe("isOrphanObject", () => {
	const NOW = Date.parse("2026-10-02T12:00:00Z");
	const ago = (ms: number) => new Date(NOW - ms);

	test("sin referencia y fuera de la ventana de gracia es huérfano", () => {
		expect(
			isOrphanObject(ago(CLOUD_LIMITS.orphanGraceMs + 1), false, NOW),
		).toBe(true);
	});

	// Una edición de certificado sin guardar dura horas: lo que sube no se
	// puede borrar mientras tanto.
	test("dentro de la ventana no lo es, aunque nadie lo use todavía", () => {
		expect(isOrphanObject(ago(3 * 60 * 60 * 1000), false, NOW)).toBe(false);
		expect(CLOUD_LIMITS.orphanGraceMs).toBeGreaterThanOrEqual(
			12 * 60 * 60 * 1000,
		);
	});

	test("con referencia o sin fecha nunca lo es", () => {
		expect(isOrphanObject(ago(30 * 24 * 60 * 60 * 1000), true, NOW)).toBe(
			false,
		);
		expect(isOrphanObject(null, false, NOW)).toBe(false);
	});
});
