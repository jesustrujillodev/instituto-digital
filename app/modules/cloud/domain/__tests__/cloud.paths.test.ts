import { describe, expect, test } from "vitest";
import { CLOUD_ERROR_CODES } from "../cloud.errors";
import {
	commonFolder,
	decodeCursor,
	encodeCursor,
	folderTrail,
	lastSegment,
	parentFolder,
} from "../cloud.paths";

describe("parentFolder", () => {
	test.each([
		["media/cursos/frente.jpg", "media/cursos/"],
		["media/cursos/", "media/"],
		["media/", ""],
		["suelto.jpg", ""],
	])("%j → %j", (path, expected) => {
		expect(parentFolder(path)).toBe(expected);
	});
});

describe("lastSegment", () => {
	test.each([
		["media/cursos/frente.jpg", "frente.jpg"],
		["media/cursos/", "cursos"],
		["media/", "media"],
	])("%j → %j", (path, expected) => {
		expect(lastSegment(path)).toBe(expected);
	});
});

describe("folderTrail", () => {
	test("de la raíz a la carpeta actual", () => {
		expect(folderTrail("media/cursos/")).toEqual([
			{ prefix: "media/", name: "media" },
			{ prefix: "media/cursos/", name: "cursos" },
		]);
	});

	test("la raíz no tiene migas", () => {
		expect(folderTrail("")).toEqual([]);
	});
});

describe("commonFolder", () => {
	test("dos carpetas hermanas comparten su padre", () => {
		// El ZIP de las dos debe contener `cursos/…` y `avisos/…`.
		expect(commonFolder(["media/cursos/", "media/avisos/"])).toBe("media/");
	});

	test("archivos de una misma carpeta comparten esa carpeta", () => {
		expect(commonFolder(["media/cursos/a.jpg", "media/cursos/b.jpg"])).toBe(
			"media/cursos/",
		);
	});

	test("prefijos distintos no comparten nada", () => {
		expect(commonFolder(["media/cursos/", "documentos/cursos/"])).toBe("");
	});

	test("un segmento que empieza igual NO es común", () => {
		expect(commonFolder(["cat/a.jpg", "media/b.jpg"])).toBe("");
	});
});

describe("cursor compuesto", () => {
	test("ida y vuelta conserva el token de cada bucket", () => {
		const cursors = { privado: "tok/en+1==", publico: "p2" };
		const encoded = encodeCursor(cursors);

		expect(encoded).not.toBeNull();
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(decodeCursor(encoded as string)).toEqual(cursors);
	});

	test("sin buckets pendientes no hay cursor", () => {
		expect(encodeCursor({})).toBeNull();
	});

	test.each(["basura", "", btoa("[]"), btoa('{"a":1}'), btoa("{}")])(
		"rechaza %j con un error tipado",
		(cursor) => {
			expect(() => decodeCursor(cursor)).toThrow(
				expect.objectContaining({ code: CLOUD_ERROR_CODES.INVALID_CURSOR }),
			);
		},
	);
});
