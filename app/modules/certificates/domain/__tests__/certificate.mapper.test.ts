import { describe, expect, test } from "vitest";
import {
	CERTIFICATE_SAMPLE_RECIPIENT,
	DEFAULT_CERTIFICATE_DESIGN,
} from "../certificate.config";
import {
	folioPartsOf,
	formatCertificateHours,
	toCertificateDesign,
	toCertificateRenderData,
	toCertificateVerification,
	toIssueRenderData,
	toSampleRenderData,
} from "../certificate.mapper";
import type { CertificateCourse } from "../certificate.types";

const course: CertificateCourse = {
	id: 7,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	status: "PUBLISHED",
	title: "Seguridad en obra",
	description: "Prevención de riesgos.",
	dependencyName: "Secretaría de Obras Públicas",
	hours: 20,
};

describe("toCertificateDesign", () => {
	test("un blob válido vuelve idéntico", () => {
		const blob = JSON.parse(JSON.stringify(DEFAULT_CERTIFICATE_DESIGN));

		expect(toCertificateDesign(blob)).toEqual(DEFAULT_CERTIFICATE_DESIGN);
	});

	test.each([
		["incompleto", { templateId: "marco", accentColor: "#750d2f" }],
		[
			"con una plantilla que ya no existe",
			{
				...DEFAULT_CERTIFICATE_DESIGN,
				templateId: "clasica",
			},
		],
		[
			"con un solo firmante",
			{
				...DEFAULT_CERTIFICATE_DESIGN,
				signatories: [DEFAULT_CERTIFICATE_DESIGN.signatories[0]],
			},
		],
		["que no es un objeto", "no soy un diseño"],
		["nulo", null],
	])("un blob %s da null en vez de lanzar", (_case, blob) => {
		expect(toCertificateDesign(blob)).toBeNull();
	});
});

describe("formatCertificateHours", () => {
	test.each([
		[20, "20 horas"],
		[1, "1 hora"],
		[7.5, "7.5 horas"],
		[null, null],
	])("%s → %s", (hours, expected) => {
		expect(formatCertificateHours(hours)).toBe(expected);
	});
});

describe("toSampleRenderData", () => {
	// 23 sep 2026, 20:00 en Tijuana, que ya es 24 en UTC.
	const today = new Date("2026-09-24T03:00:00.000Z");

	test("el curso real con una persona de muestra y el primer folio", () => {
		expect(toSampleRenderData(course, "{year}-{month}-{seq}", today)).toEqual({
			recipientName: CERTIFICATE_SAMPLE_RECIPIENT,
			courseTitle: "Seguridad en obra",
			courseDescription: "Prevención de riesgos.",
			dependencyName: "Secretaría de Obras Públicas",
			hours: "20 horas",
			issuedOn: "23 de septiembre de 2026",
			folio: "2026-09-0001",
			verificationUrl: "/verificar/00000000-0000-4000-8000-000000000000",
		});
	});

	test("el QR de muestra apunta a la verificación del origen dado", () => {
		expect(
			toSampleRenderData(course, "{seq}", today, "https://capacitacion.test")
				.verificationUrl,
		).toBe(
			"https://capacitacion.test/verificar/00000000-0000-4000-8000-000000000000",
		);
	});

	test("sin horas ni descripción no inventa nada", () => {
		const data = toSampleRenderData(
			{ ...course, hours: null, description: null },
			"{seq}",
			today,
		);

		expect(data.hours).toBeNull();
		expect(data.courseDescription).toBe("");
	});
});

describe("toIssueRenderData", () => {
	test("congela el curso, la persona, la fecha y el folio de la emisión", () => {
		const issuedAt = new Date("2026-03-10T18:00:00.000Z");

		expect(
			toIssueRenderData(course, "Ana Ruiz", "2026-0042", issuedAt),
		).toEqual({
			recipientName: "Ana Ruiz",
			courseTitle: "Seguridad en obra",
			courseDescription: "Prevención de riesgos.",
			dependencyName: "Secretaría de Obras Públicas",
			hours: "20 horas",
			issuedOn: "10 de marzo de 2026",
			folio: "2026-0042",
		});
	});
});

describe("folioPartsOf", () => {
	test("el año y el mes son los de la zona del instituto", () => {
		// 31 dic 2026, 20:00 en Tijuana, que ya es 2027 en UTC.
		expect(folioPartsOf(new Date("2027-01-01T04:00:00.000Z"))).toEqual({
			year: 2026,
			month: 12,
		});
	});
});

describe("toCertificateRenderData", () => {
	// La dirección del QR se calcula al descargar: no forma parte de lo congelado.
	test("los datos congelados vuelven idénticos, sin la dirección del QR", () => {
		const { verificationUrl: _, ...data } = toSampleRenderData(
			course,
			"{seq}",
			new Date(),
		);

		expect(
			toCertificateRenderData(
				JSON.parse(JSON.stringify({ ...data, verificationUrl: "https://x" })),
			),
		).toEqual(data);
	});

	test.each([
		["vacío", {}],
		["sin nombre", { courseTitle: "x" }],
		["corrupto", "no es un objeto"],
	])("un blob %s devuelve null sin lanzar", (_case, blob) => {
		expect(toCertificateRenderData(blob)).toBeNull();
	});
});

describe("toCertificateVerification", () => {
	const data = {
		recipientName: "Ana Ruiz",
		courseTitle: "Seguridad en obra",
		courseDescription: "Prevención de riesgos.",
		dependencyName: "Secretaría de Obras Públicas",
		hours: "20 horas",
		issuedOn: "10 de marzo de 2026",
		folio: "2026-0042",
	};

	// La forma exacta: cualquier campo nuevo en el snapshot tiene que añadirse
	// aquí a mano, no publicarse solo.
	test("un válido responde solo lo impreso", () => {
		const verification = toCertificateVerification({
			folio: "2026-0042",
			revokedAt: null,
			data,
		});

		expect(Object.keys(verification).sort()).toEqual([
			"courseTitle",
			"dependencyName",
			"folio",
			"hours",
			"issuedOn",
			"recipientName",
			"status",
		]);
		expect(verification).toMatchObject({
			status: "valid",
			recipientName: "Ana Ruiz",
		});
	});

	test("un revocado no dice de quién era ni de qué curso", () => {
		expect(
			toCertificateVerification({
				folio: "2026-0042",
				revokedAt: new Date("2026-04-01T00:00:00.000Z"),
				data,
			}),
		).toEqual({ status: "revoked", folio: "2026-0042" });
	});
});
