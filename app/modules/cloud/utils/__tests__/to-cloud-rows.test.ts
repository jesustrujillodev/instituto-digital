import { describe, expect, test } from "vitest";
import type { CloudFolder, CloudObject } from "../../domain/cloud.types";
import {
	deleteConfirmationPhrase,
	displayNameOf,
	folderHref,
	suggestedZipName,
	toCloudRows,
	toSelection,
} from "../to-cloud-rows";

const folderOf = (
	prefix: string,
	label: string | null = null,
): CloudFolder => ({
	prefix,
	name: prefix.split("/").filter(Boolean).pop() as string,
	label,
	href: null,
	visibility: "public",
});

const objectOf = (key: string): CloudObject => ({
	key,
	name: key.split("/").pop() as string,
	size: 1,
	lastModified: null,
	contentType: "image/jpeg",
	visibility: "public",
	previewUrl: null,
	reference: null,
});

describe("toCloudRows", () => {
	test("carpetas primero y sin duplicados entre páginas", () => {
		const rows = toCloudRows([
			{ folders: [folderOf("media/")], objects: [objectOf("a.jpg")] },
			{ folders: [folderOf("media/"), folderOf("docs/")], objects: [] },
		]);

		expect(rows.map((row) => row.id)).toEqual(["media/", "docs/", "a.jpg"]);
	});
});

describe("displayNameOf", () => {
	test("una carpeta reconocida se muestra con su nombre legible", () => {
		const [row] = toCloudRows([
			{
				folders: [folderOf("media/curso-induccion/", "Ana Ruiz")],
				objects: [],
			},
		]);

		expect(displayNameOf(row)).toBe("Ana Ruiz");
	});
});

describe("toSelection", () => {
	test("separa carpetas de archivos por la barra final", () => {
		expect(toSelection(["media/a.jpg", "media/cursos/"])).toEqual({
			keys: ["media/a.jpg"],
			prefixes: ["media/cursos/"],
		});
	});
});

describe("folderHref", () => {
	test("codifica la ruta y la raíz no lleva parámetro", () => {
		expect(folderHref("")).toBe("/dashboard/nube");
		expect(folderHref("media/cursos/")).toBe(
			"/dashboard/nube?path=media%2Fcursos%2F",
		);
	});
});

describe("suggestedZipName", () => {
	test("una carpeta sola da su nombre", () => {
		expect(
			suggestedZipName({ keys: [], prefixes: ["media/cursos/"] }, "media/"),
		).toBe("cursos.zip");
	});

	test("una selección mixta toma la carpeta actual, o 'nube' en la raíz", () => {
		const mixed = { keys: ["media/a.jpg"], prefixes: ["media/b/"] };

		expect(suggestedZipName(mixed, "media/")).toBe("media.zip");
		expect(suggestedZipName(mixed, "")).toBe("nube.zip");
	});
});

describe("deleteConfirmationPhrase", () => {
	test("solo archivos no pide escribir nada", () => {
		expect(deleteConfirmationPhrase({ prefixes: [] })).toBeNull();
	});

	test("una carpeta pide su nombre; varias, la palabra eliminar", () => {
		expect(deleteConfirmationPhrase({ prefixes: ["media/cursos/"] })).toBe(
			"cursos",
		);
		expect(
			deleteConfirmationPhrase({ prefixes: ["media/a/", "media/b/"] }),
		).toBe("eliminar");
	});
});
