import { describe, expect, test } from "vitest";
import {
	validateCloudKey,
	validateCloudList,
	validateCloudPath,
	validateCloudSelection,
} from "../cloud.rules";

describe("validateCloudKey", () => {
	test("acepta una key de vehículo", () => {
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
