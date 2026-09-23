import { describe, expect, test } from "vitest";
import { DEFAULT_CERTIFICATE_DESIGN } from "../certificate.config";
import {
	renderCertificate,
	renderCertificateDocument,
	TEMPLATE_RENDERERS,
} from "../certificate.renderer";
import {
	CERTIFICATE_TEMPLATE_IDS,
	type CertificateTemplateId,
} from "../certificate.rules";
import type {
	CertificateDesign,
	CertificateRenderData,
} from "../certificate.types";

const OPTIONS = { assetBaseUrl: "https://app.test" };

const data: CertificateRenderData = {
	recipientName: "Diana Ruiz Peña",
	courseTitle: "Seguridad en obra",
	courseDescription: "Prevención de riesgos en la obra pública.",
	dependencyName: "Secretaría de Obras Públicas",
	hours: "20 horas",
	issuedOn: "23 de septiembre de 2026",
	folio: "2026-0001",
};

const designOf = (
	templateId: CertificateTemplateId,
	overrides: Partial<CertificateDesign> = {},
): CertificateDesign => ({
	...DEFAULT_CERTIFICATE_DESIGN,
	templateId,
	...overrides,
});

/** Los selectores de una hoja de estilos plana, sin los `@font-face`. */
const selectorsOf = (css: string): string[] =>
	css
		.split("}")
		.map((rule) => rule.split("{")[0].trim())
		.filter((selector) => selector && !selector.startsWith("@"))
		.flatMap((selector) => selector.split(",").map((part) => part.trim()));

const footerCellsOf = (html: string) =>
	(html.match(/class="cell /g) ?? []).length;

describe.each(CERTIFICATE_TEMPLATE_IDS)("plantilla %s", (templateId) => {
	test("interpola los datos de la emisión", () => {
		const { html } = renderCertificate(designOf(templateId), data, OPTIONS);

		for (const value of [
			"Diana Ruiz Peña",
			"Seguridad en obra",
			"Secretaría de Obras Públicas",
			"Con una duración de 20 horas",
			"23 de septiembre de 2026",
			"2026-0001",
			"Prevención de riesgos en la obra pública.",
		]) {
			expect(html).toContain(value);
		}
		expect(html).toContain(`class="cert t-${templateId}"`);
	});

	test("sin horas omite la línea", () => {
		const { html } = renderCertificate(
			designOf(templateId),
			{ ...data, hours: null },
			OPTIONS,
		);

		expect(html).not.toContain("Con una duración de");
	});

	test("la descripción del diseño manda sobre la del curso", () => {
		const { html } = renderCertificate(
			designOf(templateId, { description: "Texto propio del certificado" }),
			data,
			OPTIONS,
		);

		expect(html).toContain("Texto propio del certificado");
		expect(html).not.toContain("Prevención de riesgos");
	});

	test("un nombre con marcado sale como texto y no inyecta nada", () => {
		const { html } = renderCertificate(
			designOf(templateId, { subtitle: `"><img src=x onerror=alert(1)>` }),
			{ ...data, recipientName: `<script>alert("x")</script> O'Brien` },
			OPTIONS,
		);

		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img src=x");
		expect(html).toContain(
			"&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; O&#39;Brien",
		);
	});

	test("todo su CSS cuelga de su raíz", () => {
		const { styles } = TEMPLATE_RENDERERS[templateId]({
			design: designOf(templateId),
			data,
			logoUrl: "/assets/aytoBco.png",
			signatureSrc: () => null,
			description: null,
		});

		for (const selector of selectorsOf(styles)) {
			expect(selector.startsWith(`.t-${templateId}`)).toBe(true);
		}
	});

	test("apagar una firma no quita su celda del pie", () => {
		const [first, second] = DEFAULT_CERTIFICATE_DESIGN.signatories;
		const both = renderCertificate(designOf(templateId), data, OPTIONS);
		const one = renderCertificate(
			designOf(templateId, {
				signatories: [{ ...first, enabled: false }, second],
			}),
			data,
			OPTIONS,
		);

		expect(footerCellsOf(both.html)).toBe(4);
		expect(footerCellsOf(one.html)).toBe(4);
		expect(one.html).not.toContain(first.name);
	});

	test("un acento malicioso no llega al CSS", () => {
		const { styles } = renderCertificate(
			designOf(templateId, { accentColor: "red;} body{display:none" }),
			data,
			OPTIONS,
		);

		expect(styles).not.toContain("display:none");
		expect(styles).toContain(DEFAULT_CERTIFICATE_DESIGN.accentColor);
	});

	test("una firma con URL no permitida se pinta sin imagen", () => {
		const [first, second] = DEFAULT_CERTIFICATE_DESIGN.signatories;
		const { html } = renderCertificate(
			designOf(templateId, {
				signatories: [
					{ ...first, signatureUrl: "javascript:alert(1)" },
					{ ...second, signatureUrl: "https://cdn.test/firma.png" },
				],
			}),
			data,
			OPTIONS,
		);

		expect(html).not.toContain("javascript:");
		expect(html).toContain('src="https://cdn.test/firma.png"');
	});
});

describe("renderCertificate", () => {
	test("una plantilla desconocida se dibuja con la institucional", () => {
		const { html } = renderCertificate(
			designOf("clasica" as CertificateTemplateId),
			data,
			OPTIONS,
		);

		expect(html).toContain('class="cert t-institucional"');
	});

	test("fuentes y logo se resuelven contra la base del documento", () => {
		const { html, styles } = renderCertificate(
			designOf("institucional"),
			data,
			OPTIONS,
		);

		expect(html).toContain('src="https://app.test/assets/aytoBco.png"');
		expect(styles).toContain(
			'url("https://app.test/font/ITCAvantGardeStd-Bk.woff2")',
		);
		expect(styles).not.toContain("fonts.googleapis");
	});

	test("los fondos se conservan al imprimir y el lienzo es fijo", () => {
		const { styles } = renderCertificate(
			designOf("institucional"),
			data,
			OPTIONS,
		);

		expect(styles).toContain("print-color-adjust: exact");
		expect(styles).toContain("width: 1100px; height: 780px");
		expect(styles).not.toContain("@media");
	});

	test("sin descripción en el diseño ni en el curso no pinta el bloque", () => {
		const { html } = renderCertificate(
			designOf("institucional"),
			{ ...data, courseDescription: "  " },
			OPTIONS,
		);

		expect(html).not.toContain('class="description"');
	});
});

describe("renderCertificateDocument", () => {
	test("mete el CSS dentro del head: es un documento autocontenido", () => {
		const document = renderCertificateDocument(
			designOf("minima"),
			data,
			OPTIONS,
		);

		expect(document).toMatch(/<head>[\s\S]*<style>[\s\S]*<\/style>\s*<\/head>/);
		expect(document).toContain('class="cert t-minima"');
	});
});

describe("con recursos incrustados", () => {
	const ref = "/api/storage?key=documentos%2Ffirmas%2Fc%2Ffirma.png";
	const assets = {
		fonts: {
			XLt: "data:font/woff2;base64,WA==",
			Bk: "data:font/woff2;base64,Qg==",
			Md: "data:font/woff2;base64,TQ==",
			Demi: "data:font/woff2;base64,RA==",
			Bold: "data:font/woff2;base64,Qg==",
		},
		logo: "data:image/png;base64,TE9HTw==",
		signatures: { [ref]: "data:image/png;base64,RklSTUE=" },
	};
	const signed = designOf("institucional", {
		signatories: [
			{ ...DEFAULT_CERTIFICATE_DESIGN.signatories[0], signatureUrl: ref },
			DEFAULT_CERTIFICATE_DESIGN.signatories[1],
		],
	});

	// Es lo que exporta Chromium, que no tiene red ni sesión: nada se pide por URL.
	test("el documento no apunta a ninguna URL", () => {
		const document = renderCertificateDocument(signed, data, {
			...OPTIONS,
			assets,
		});

		expect(document).toContain(assets.logo);
		expect(document).toContain(assets.signatures[ref]);
		expect(document).toContain(assets.fonts.Demi);
		expect(document).not.toContain("https://app.test");
		expect(document).not.toContain("/api/storage");
	});

	test("una firma que no está entre los recursos no se pinta", () => {
		const document = renderCertificateDocument(signed, data, {
			...OPTIONS,
			assets: { ...assets, signatures: {} },
		});

		expect(document).not.toContain('<img src="/api');
		expect(document).not.toContain("RklSTUE=");
	});

	test("sin recursos, la vista previa sigue pidiendo por URL", () => {
		const document = renderCertificateDocument(signed, data, OPTIONS);

		expect(document).toContain("https://app.test/assets/aytoBco.png");
		expect(document).toContain(ref.replaceAll("&", "&amp;"));
	});
});
