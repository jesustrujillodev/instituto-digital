import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ALL_FACES, faceKeyOf, findFace } from "../design/font-catalog";
import { metricsOf } from "../design/font-metrics";

describe("catálogo de fuentes", () => {
	test.each([...ALL_FACES])(
		"las métricas de %s son las de su archivo",
		(key, face) => {
			const bytes = readFileSync(path.resolve("public", face.file.slice(1)));
			const hash = createHash("sha256").update(bytes).digest("hex");

			// Si falla, el archivo cambió: se publica con otro nombre y otro id, y
			// se regeneran las métricas con `bun run certificates:font-metrics`.
			expect(metricsOf(key)?.hash).toBe(hash);
		},
	);

	test("encuentra una cara por fuente, grosor y estilo", () => {
		expect(findFace("eb-garamond", 400, true)?.file).toBe(
			"/font/cert/eb-garamond-400-italic.v1.woff2",
		);
		expect(findFace("cinzel", 400, true)).toBeUndefined();
	});

	test("la clave de cara distingue la cursiva", () => {
		expect(faceKeyOf("playfair", 700, false)).toBe("playfair-700");
		expect(faceKeyOf("playfair", 400, true)).toBe("playfair-400-italic");
	});
});
