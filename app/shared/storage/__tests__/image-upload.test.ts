import { describe, expect, test } from "vitest";
import { asSniffedImage, sniffRasterImage } from "../image-upload";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")];
const SVG = [...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')];

const fileOf = (name: string, type: string, bytes: number[]) => ({
	name,
	type,
	size: bytes.length,
	arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

describe("sniffRasterImage", () => {
	test.each([
		["png", PNG, "image/png"],
		["jpeg", JPEG, "image/jpeg"],
		["webp", WEBP, "image/webp"],
		["svg", SVG, null],
		["vacío", [], null],
	])("%s → %s", (_case, bytes, expected) => {
		expect(sniffRasterImage(new Uint8Array(bytes))).toBe(expected);
	});
});

// Remediación (Fase C): fotos y portadas se validaban por el tipo que declaraba
// el navegador, y la extensión salía del nombre.
describe("asSniffedImage", () => {
	test("tipo y extensión salen de los bytes, no de lo declarado", async () => {
		const image = await asSniffedImage(
			fileOf("foto.html", "image/png", JPEG),
			ALLOWED,
		);

		expect(image?.name).toBe("foto.jpg");
		expect(image?.type).toBe("image/jpeg");
		expect(new Uint8Array((await image?.arrayBuffer()) ?? [])).toEqual(
			new Uint8Array(JPEG),
		);
	});

	test("un archivo que no es imagen se rechaza aunque declare serlo", async () => {
		expect(
			await asSniffedImage(fileOf("logo.png", "image/png", SVG), ALLOWED),
		).toBeNull();
	});

	test("una imagen de un tipo no admitido también", async () => {
		expect(
			await asSniffedImage(fileOf("x.webp", "image/webp", WEBP), ["image/png"]),
		).toBeNull();
	});

	test("un nombre sin extensión recibe la suya", async () => {
		expect((await asSniffedImage(fileOf("foto", "", PNG), ALLOWED))?.name).toBe(
			"foto.png",
		);
	});
});
