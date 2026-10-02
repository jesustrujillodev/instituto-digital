import { describe, expect, test } from "vitest";
import { renderCertificateDocument } from "../certificate.renderer";
import type { CertificateRenderData } from "../certificate.types";
import {
	CERTIFICATE_TEMPLATE_IDS,
	type CertificateDesignV1,
} from "../design/design-v1.schema";

// Lo que se emitió con un diseño v1 se dibuja así para siempre: los snapshots
// congelados en `certificate_issues` no se reescriben. Si una de estas pruebas
// falla, cambió la apariencia de certificados ya entregados.

const V1_DESIGN: CertificateDesignV1 = {
	templateId: "institucional",
	accentColor: "#750d2f",
	subtitle: "",
	description: "",
	signatories: [
		{
			name: "Nombre de quien imparte",
			role: "Capacitador",
			enabled: true,
			signatureUrl: "/api/storage?key=documentos%2Ffirmas%2Fc%2Fa.png",
		},
		{
			name: "Nombre de quien dirige",
			role: "Titular de la dependencia",
			enabled: true,
			signatureUrl: null,
		},
	],
	folioFormat: "{year}-{seq}",
};

const DATA: CertificateRenderData = {
	recipientName: "Diana Ruiz Peña",
	courseTitle: "Seguridad en obra",
	courseDescription:
		"Prevención de riesgos, equipo de protección personal y señalización en la obra pública municipal.",
	dependencyName: "Secretaría de Obras Públicas",
	hours: "20 horas",
	issuedOn: "23 de septiembre de 2026",
	folio: "2026-0001",
	verificationUrl: "https://capacitacion.example/verificar/abc",
};

const [first, second] = V1_DESIGN.signatories;

const CASES: {
	name: string;
	design?: Partial<CertificateDesignV1>;
	data?: Partial<CertificateRenderData>;
}[] = [
	{ name: "normal", design: { subtitle: "Programa anual 2026" } },
	{
		name: "textos-largos",
		design: {
			subtitle:
				"Programa anual de capacitación y actualización profesional del personal del Ayuntamiento 2026",
			signatories: [
				{
					...first,
					name: "María Guadalupe Hernández de la Fuente Villaseñor",
					role: "Coordinadora de Capacitación y Desarrollo Organizacional",
				},
				{ ...second, name: "José Francisco Martínez Castañeda Ibarra" },
			],
		},
		data: {
			recipientName:
				"María Fernanda Guadalupe Rodríguez de la Barrera Villalobos",
			courseTitle:
				"Actualización en el marco normativo municipal para la contratación, supervisión y finiquito de la obra pública",
		},
	},
	{
		name: "sin-firmas-ni-horas",
		design: {
			signatories: [
				{ ...first, enabled: false },
				{ ...second, enabled: false },
			],
		},
		data: { hours: null, verificationUrl: null },
	},
	{
		name: "nombre-malicioso",
		design: { subtitle: `"><img src=x onerror=alert(1)>` },
		data: { recipientName: `<script>alert("x")</script> O'Brien & Cía.` },
	},
];

const ASSETS = {
	fonts: {
		XLt: "data:f0",
		Bk: "data:f1",
		Md: "data:f2",
		Demi: "data:f3",
		Bold: "data:f4",
	},
	logo: "data:logo",
	faces: {},
	logos: {},
	images: {
		"/api/storage?key=documentos%2Ffirmas%2Fc%2Fa.png": "data:sig",
	},
};

describe.each(CERTIFICATE_TEMPLATE_IDS)("golden v1 · %s", (templateId) => {
	test.each(CASES)("$name", async ({ name, design, data }) => {
		const input = { ...V1_DESIGN, templateId, ...design };
		const merged = { ...DATA, ...data };

		await expect(
			renderCertificateDocument(input, merged, { assetBaseUrl: "" }),
		).toMatchFileSnapshot(`./__golden__/${templateId}-${name}.html`);
		await expect(
			renderCertificateDocument(input, merged, {
				assetBaseUrl: "",
				assets: ASSETS,
			}),
		).toMatchFileSnapshot(`./__golden__/${templateId}-${name}.assets.html`);
	});
});
