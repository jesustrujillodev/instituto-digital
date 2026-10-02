import { describe, expect, test } from "vitest";
import {
	renderCertificate,
	renderCertificateDocument,
} from "../certificate.renderer";
import type { CertificateRenderData } from "../certificate.types";
import { PRESETS } from "../design/design.presets";
import type {
	CertificateDesignV2,
	DesignElement,
} from "../design/design-v2.schema";
import { renderElementHtml } from "../design/render-v2";

const DATA: CertificateRenderData = {
	recipientName: "Diana Ruiz Peña",
	courseTitle: "Seguridad en obra",
	courseDescription: "Prevención de riesgos.",
	dependencyName: "Obras Públicas",
	hours: "20 horas",
	issuedOn: "1 de octubre de 2026",
	folio: "2026-0001",
	verificationUrl: "https://capacitacion.example/verificar/abc",
};

const designWith = (...extra: DesignElement[]): CertificateDesignV2 => ({
	...structuredClone(PRESETS.institucional),
	elements: [...PRESETS.institucional.elements, ...extra],
});

const elementOf = (id: string) =>
	PRESETS.institucional.elements.find((e) => e.id === id) as DesignElement;

const textElement = (patch: Partial<DesignElement>) =>
	({ ...elementOf("otorga"), id: "prueba", ...patch }) as DesignElement;

const render = (design: CertificateDesignV2, data = DATA) =>
	renderCertificateDocument(design, data, { assetBaseUrl: "" });

describe("render v2", () => {
	test("pinta un div absoluto por elemento con su id", () => {
		const html = render(PRESETS.institucional);
		for (const element of PRESETS.institucional.elements) {
			expect(html).toContain(`data-el-id="${element.id}"`);
		}
	});

	test("la página mide lo que dice el diseño, en puntos", () => {
		const { styles, html } = renderCertificate(PRESETS.institucional, DATA, {
			assetBaseUrl: "",
		});
		expect(styles).toContain("@page { size: 841.89pt 595.28pt; margin: 0; }");
		expect(html).toContain('content="width=1123"');
	});

	test("resuelve los campos y escapa el resultado", () => {
		const html = render(PRESETS.institucional, {
			...DATA,
			recipientName: `<script>alert("x")</script> O'Brien & Cía.`,
		});
		expect(html).not.toContain("<script>alert");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("O&#39;Brien &amp; Cía.");
	});

	test("un texto con un campo vacío no pinta nada, pero deja su div", () => {
		const html = render(PRESETS.institucional, { ...DATA, hours: null });
		expect(html).toContain('data-el-id="duracion" style="');
		expect(html).not.toContain("Con una duración de");
	});

	test("un elemento oculto deja su div vacío", () => {
		const html = renderElementHtml(
			{ ...elementOf("otorga"), hidden: true },
			{ data: DATA, imageSrc: () => null },
		);
		expect(html).toMatch(/data-el-id="otorga" style="[^"]*"><\/div>$/);
	});

	test("rotación y opacidad van al estilo del elemento", () => {
		const html = renderElementHtml(
			{ ...elementOf("otorga"), rotation: 12.5, opacity: 0.4 },
			{ data: DATA, imageSrc: () => null },
		);
		expect(html).toContain("transform:rotate(12.5deg)");
		expect(html).toContain("opacity:0.4");
	});

	test("un color que no es #rrggbb no llega al CSS", () => {
		const html = render(
			designWith(textElement({ color: "red;}body{display:none" } as never)),
		);
		expect(html).not.toContain("display:none");
	});

	test("las mayúsculas se aplican antes de medir, en español", () => {
		const html = render(
			designWith(textElement({ content: "ñandú", uppercase: true } as never)),
		);
		expect(html).toContain("ÑANDÚ");
	});

	test("justificado: todos los renglones menos el último de cada párrafo", () => {
		const html = render(
			designWith(
				textElement({
					content: "uno dos tres cuatro cinco seis siete ocho nueve diez",
					align: "justify",
					w: 80,
					h: 200,
					fit: "wrap",
				} as never),
			),
		);
		expect(html).toContain("text-align-last:justify");
		expect(html).toContain("text-align:left;white-space:pre");
	});

	test("el folio lleva su etiqueta", () => {
		const html = render(designWith(), { ...DATA, folio: "F-9" }).replace(
			/\s+/g,
			" ",
		);
		expect(html).toContain(">F-9<");
	});

	test("las formas son SVG, con el trazo hacia dentro", () => {
		const html = renderElementHtml(
			{
				...elementOf("franja"),
				type: "shape",
				kind: "rect",
				fill: "#112233",
				stroke: "#445566",
				strokeWidth: 4,
				cornerRadius: 10,
				w: 100,
				h: 50,
			} as DesignElement,
			{ data: DATA, imageSrc: () => null },
		);
		expect(html).toContain('<rect x="2" y="2" width="96" height="46" rx="10"');
		expect(html).toContain('fill="#112233" stroke="#445566"');
	});

	test("elipse y línea", () => {
		const shape = {
			...elementOf("franja"),
			type: "shape",
			w: 100,
			h: 40,
		} as DesignElement;
		const ellipse = renderElementHtml(
			{ ...shape, kind: "ellipse", stroke: null } as DesignElement,
			{ data: DATA, imageSrc: () => null },
		);
		const line = renderElementHtml(
			{
				...shape,
				kind: "line",
				stroke: "#000000",
				strokeWidth: 2,
			} as DesignElement,
			{ data: DATA, imageSrc: () => null },
		);
		expect(ellipse).toContain('<ellipse cx="50" cy="20" rx="50" ry="20"');
		expect(line).toContain('<line x1="0" y1="20" x2="100" y2="20" fill="none"');
	});

	test("una imagen sin fuente segura no se pinta", () => {
		const html = renderElementHtml(elementOf("logo"), {
			data: DATA,
			imageSrc: () => null,
		});
		expect(html).not.toContain("<img");
	});

	test("el logo integrado se pide por su ruta de public/", () => {
		expect(render(PRESETS.institucional)).toContain(
			'src="/assets/aytoBco.png"',
		);
	});

	test("un logo subido sale de las URLs que da quien llama", () => {
		const design = designWith({
			...elementOf("logo"),
			id: "otro-logo",
			src: { kind: "logo", logoId: "00000000-0000-4000-8000-000000000001" },
		} as DesignElement);
		const html = renderCertificateDocument(design, DATA, {
			assetBaseUrl: "",
			logoUrls: {
				"00000000-0000-4000-8000-000000000001": "https://cdn.example/logo.svg",
			},
		});
		expect(html).toContain('src="https://cdn.example/logo.svg"');
	});

	test("sin dirección de verificación pinta el hueco del QR", () => {
		expect(
			render(PRESETS.institucional, { ...DATA, verificationUrl: null }),
		).toContain('class="qr-empty"');
	});

	test("con recursos incrustados todo sale de data URIs", () => {
		const html = renderCertificateDocument(PRESETS.institucional, DATA, {
			assetBaseUrl: "https://app.example",
			assets: {
				faces: {
					"avant-garde-400": "data:font-1",
					"avant-garde-600": "data:font-2",
					"eb-garamond-400": "data:f3",
					"eb-garamond-400-italic": "data:f4",
				},
				logos: { "ayto-blanco": "data:logo" },
				images: {},
			},
		});
		expect(html).toContain('src="data:logo"');
		expect(html).toContain('url("data:font-1")');
		expect(html).not.toContain("https://app.example/font");
	});

	test("solo declara las caras que usa", () => {
		const { styles } = renderCertificate(PRESETS.institucional, DATA, {
			assetBaseUrl: "",
		});
		expect(styles).toContain("/font/cert/eb-garamond-400-italic.v1.woff2");
		expect(styles).not.toContain("great-vibes");
	});

	test("la capa para el PDF de fondo es transparente y sin raster", () => {
		const design: CertificateDesignV2 = {
			...structuredClone(PRESETS.institucional),
			background: {
				kind: "pdf",
				pdfRef: "/api/storage?key=a.pdf",
				rasterRef: "/api/storage?key=a.webp",
				rasterDpi: 300,
				widthPt: 841.89,
				heightPt: 595.28,
			},
		};
		const full = renderCertificateDocument(design, DATA, { assetBaseUrl: "" });
		const overlay = renderCertificateDocument(design, DATA, {
			assetBaseUrl: "",
			mode: "overlay",
		});
		expect(full).toContain('class="bg" src="/api/storage?key=a.webp"');
		expect(overlay).not.toContain('class="bg"');
		expect(overlay).toContain("background: transparent");
	});
});
