import { describe, expect, test } from "vitest";
import { certificateQrSvg } from "../qr";

const URL_OF =
	"https://capacitacion.test/verificar/cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("certificateQrSvg", () => {
	test("es un SVG plano: un fondo y un solo trazo, sin imágenes ni scripts", () => {
		const svg = certificateQrSvg(URL_OF, 80);

		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg).toContain('width="80" height="80"');
		expect(svg.match(/<path /g)).toHaveLength(1);
		expect(svg).not.toMatch(/<image|<script|href=/);
	});

	test("es determinista: la vista previa y el PDF pintan el mismo código", () => {
		expect(certificateQrSvg(URL_OF, 80)).toBe(certificateQrSvg(URL_OF, 80));
		expect(certificateQrSvg(URL_OF, 80)).not.toBe(
			certificateQrSvg(`${URL_OF}0`, 80),
		);
	});
});
