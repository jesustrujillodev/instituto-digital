import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { toProxyRef } from "@/shared/storage/public-url";
import {
	CERTIFICATE_ACCENTS,
	CERTIFICATE_MIN_LOGO_CONTRAST,
	CERTIFICATE_TEXT_LIMITS,
	DEFAULT_CERTIFICATE_DESIGN,
} from "../certificate.config";
import {
	accentContrastWithWhite,
	canEditCertificate,
	certificateDesignSchema,
	certificateFileName,
	certificateRules,
	certificateStateOf,
	courseOfSignatureKey,
	designsEqual,
	diffIssues,
	isOwnSignatureRef,
	resolveFolio,
	resolveTemplateId,
	safeAccent,
	safeImageUrl,
} from "../certificate.rules";

describe("resolveTemplateId", () => {
	test("una plantilla conocida se conserva", () => {
		expect(resolveTemplateId("marco")).toBe("marco");
	});

	test.each([
		["desconocida", "clasica"],
		["vacía", ""],
		["nula", null],
		["ausente", undefined],
	])("una plantilla %s cae en la institucional", (_case, value) => {
		expect(resolveTemplateId(value)).toBe("institucional");
	});
});

describe("safeAccent", () => {
	test("un #rrggbb pasa, en minúsculas", () => {
		expect(safeAccent("#225B4F")).toBe("#225b4f");
	});

	test.each([
		"red;} body{display:none",
		"#fff",
		"url(https://x.test/a.png)",
		"#12345g",
		"",
	])("«%s» cae en el acento por defecto", (value) => {
		expect(safeAccent(value)).toBe(CERTIFICATE_ACCENTS[0]);
	});
});

describe("safeImageUrl", () => {
	test.each([
		"https://cdn.test/firmas/a.png",
		"/api/storage?key=media%2Ffirmas%2Fa.png",
	])("admite %s", (value) => {
		expect(safeImageUrl(value)).toBe(value);
	});

	test.each([
		"javascript:alert(1)",
		"data:image/png;base64,AAAA",
		"blob:https://app.test/1234",
		"http://sin-tls.test/a.png",
		"/otra/ruta.png",
		"no es una url",
		"",
		null,
	])("descarta %s", (value) => {
		expect(safeImageUrl(value)).toBeNull();
	});
});

describe("certificateDesignSchema", () => {
	const parse = (overrides: Record<string, unknown>) =>
		v.safeParse(certificateDesignSchema, {
			...DEFAULT_CERTIFICATE_DESIGN,
			...overrides,
		});

	test("el diseño por defecto es válido", () => {
		expect(parse({}).success).toBe(true);
	});

	test("el subtítulo admite justo su tope y no uno más", () => {
		const max = CERTIFICATE_TEXT_LIMITS.subtitle;

		expect(parse({ subtitle: "a".repeat(max) }).success).toBe(true);
		expect(parse({ subtitle: "a".repeat(max + 1) }).success).toBe(false);
	});

	test.each([
		["una plantilla inventada", { templateId: "clasica" }],
		["un acento que no es #rrggbb", { accentColor: "red" }],
		[
			"un solo firmante",
			{ signatories: [DEFAULT_CERTIFICATE_DESIGN.signatories[0]] },
		],
	])("rechaza %s", (_case, overrides) => {
		expect(parse(overrides).success).toBe(false);
	});
});

const COURSE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const signatureRef = (course: string, file = "firma-1.png") =>
	toProxyRef(`documentos/firmas/${course}/${file}`);

describe("canEditCertificate", () => {
	test.each(["DRAFT", "PUBLISHED", "FINISHED"] as const)(
		"un curso %s sigue editando su certificado",
		(status) => {
			expect(canEditCertificate(status)).toBe(true);
		},
	);

	test("un cancelado ya no", () => {
		expect(canEditCertificate("CANCELLED")).toBe(false);
	});
});

describe("courseOfSignatureKey", () => {
	test("lee el curso del segundo segmento", () => {
		expect(courseOfSignatureKey(`documentos/firmas/${COURSE}/a.png`)).toBe(
			COURSE,
		);
	});

	test.each([
		"documentos/lecciones/x.pdf",
		"documentos/firmas/sin-archivo",
		"media/firmas/x/a.png",
	])("%s no es una firma", (key) => {
		expect(courseOfSignatureKey(key)).toBeNull();
	});
});

describe("isOwnSignatureRef", () => {
	test("la firma subida a este curso es suya", () => {
		expect(isOwnSignatureRef(signatureRef(COURSE), COURSE)).toBe(true);
	});

	test.each([
		["de otro curso", signatureRef(OTHER)],
		["una vista previa local", "blob:https://app.test/1234"],
		["un data URI", "data:image/png;base64,AAAA"],
		["una URL externa", "https://cdn.test/firma.png"],
		["otra carpeta de storage", toProxyRef("media/portadas/a.png")],
		[
			"una key sin codificar",
			`/api/storage?key=documentos/firmas/${COURSE}/a.png`,
		],
		[
			"un escape de carpeta",
			toProxyRef(`documentos/firmas/${COURSE}/../${OTHER}/a.png`),
		],
	])("rechaza %s", (_case, ref) => {
		expect(isOwnSignatureRef(ref, COURSE)).toBe(false);
	});
});

describe("resolveFolio", () => {
	test("resuelve los tres tokens con sus ceros", () => {
		expect(
			resolveFolio("SOP-{year}-{month}-{seq}", {
				seq: 7,
				year: 2026,
				month: 3,
			}),
		).toBe("SOP-2026-03-0007");
	});

	test("un formato sin tokens sale tal cual", () => {
		expect(resolveFolio("Constancia", { seq: 1, year: 2026, month: 9 })).toBe(
			"Constancia",
		);
	});
});

describe("accentContrastWithWhite", () => {
	test("el guinda del manual contrasta con el logo blanco", () => {
		expect(accentContrastWithWhite("#750d2f")).toBeGreaterThan(
			CERTIFICATE_MIN_LOGO_CONTRAST,
		);
	});

	test("un color claro no", () => {
		expect(accentContrastWithWhite("#f2f2f2")).toBeLessThan(
			CERTIFICATE_MIN_LOGO_CONTRAST,
		);
	});
});

describe("designsEqual y certificateStateOf", () => {
	test("el orden de las claves no es un cambio", () => {
		const reordered = Object.fromEntries(
			Object.entries(DEFAULT_CERTIFICATE_DESIGN).reverse(),
		) as typeof DEFAULT_CERTIFICATE_DESIGN;

		expect(designsEqual(DEFAULT_CERTIFICATE_DESIGN, reordered)).toBe(true);
	});

	test("un texto distinto sí", () => {
		expect(
			designsEqual(DEFAULT_CERTIFICATE_DESIGN, {
				...DEFAULT_CERTIFICATE_DESIGN,
				subtitle: "Otro",
			}),
		).toBe(false);
	});

	test("sin publicado, con publicado igual y con cambios", () => {
		const draft = DEFAULT_CERTIFICATE_DESIGN;

		expect(certificateStateOf({ draft, published: null })).toBe(
			"never-published",
		);
		expect(certificateStateOf({ draft, published: { ...draft } })).toBe(
			"published",
		);
		expect(
			certificateStateOf({
				draft: { ...draft, accentColor: "#225b4f" },
				published: draft,
			}),
		).toBe("unpublished-changes");
	});
});

describe("folioFormat", () => {
	test("sin {seq} todos los folios serían iguales y se rechaza", () => {
		const result = v.safeParse(certificateDesignSchema, {
			...DEFAULT_CERTIFICATE_DESIGN,
			folioFormat: "SOP-{year}",
		});

		expect(result.success).toBe(false);
		expect(result.issues?.[0].message).toBe(
			"El formato del folio debe incluir {seq}.",
		);
	});
});

describe("diffIssues", () => {
	const ana = {
		userId: 50,
		recipientName: "Ana Ruiz",
		email: "ana@instituto.gob.mx",
		firstName: "Ana",
		lastName: "Ruiz",
	};
	const luis = {
		userId: 51,
		recipientName: "Luis Peña",
		email: "luis@universidad.mx",
		firstName: "Luis",
		lastName: "Peña",
	};

	test("emite a quien completó y no tiene emisión", () => {
		expect(diffIssues([], [ana, luis])).toEqual({
			issue: [ana, luis],
			restore: [],
			revoke: [],
		});
	});

	test("volver a sincronizar no emite otra vez", () => {
		expect(
			diffIssues(
				[
					{ userId: 50, revokedAt: null },
					{ userId: 51, revokedAt: null },
				],
				[ana, luis],
			),
		).toEqual({ issue: [], restore: [], revoke: [] });
	});

	test("revoca a quien dejó de completar y restaura a quien volvió", () => {
		expect(
			diffIssues(
				[
					{ userId: 50, revokedAt: null },
					{ userId: 51, revokedAt: new Date("2026-03-10T00:00:00.000Z") },
				],
				[luis],
			),
		).toEqual({ issue: [], restore: [51], revoke: [50] });
	});
});

describe("certificateRules.download", () => {
	const documentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

	// El diseño nunca viaja en la petición: lo que no es identificador o
	// formato ni siquiera sale del esquema.
	test("solo conserva el identificador y el formato", () => {
		const output = v.parse(certificateRules.download, {
			documentId,
			format: "pdf",
			design: { subtitle: "Falsificado" },
		});

		expect(output).toEqual({ documentId, format: "pdf" });
	});

	test("un formato que no es PDF ni PNG se rechaza", () => {
		expect(
			v.safeParse(certificateRules.download, { documentId, format: "svg" })
				.success,
		).toBe(false);
	});
});

describe("certificateFileName", () => {
	test.each([
		["2026-0001", "pdf", "certificado-2026-0001.pdf"],
		["SOP/2026 0001", "png", "certificado-SOP-2026-0001.png"],
		["///", "pdf", "certificado-sin-folio.pdf"],
	] as const)("%s → %s", (folio, format, expected) => {
		expect(certificateFileName(folio, format)).toBe(expected);
	});
});

describe("certificateRules.verify", () => {
	test("solo un UUID pasa", () => {
		expect(
			v.safeParse(certificateRules.verify, {
				documentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			}).success,
		).toBe(true);
		expect(
			v.safeParse(certificateRules.verify, { documentId: "2026-0001" }).success,
		).toBe(false);
	});
});
