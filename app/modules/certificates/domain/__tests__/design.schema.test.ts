import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { PRESETS } from "../design/design.presets";
import { certificateDesignSchema, isDesignV2 } from "../design/design.schema";
import { LEGACY_DEFAULT_DESIGN_V1 } from "../design/design-v1.schema";
import {
	type CertificateDesignV2,
	type DesignElement,
	designV2Schema,
} from "../design/design-v2.schema";

const design = (
	patch: Partial<CertificateDesignV2> = {},
): CertificateDesignV2 => ({
	...structuredClone(PRESETS.institucional),
	...patch,
});

const withElement = (
	id: string,
	patch: Partial<DesignElement>,
): CertificateDesignV2 => {
	const base = design();
	return {
		...base,
		elements: base.elements.map((element) =>
			element.id === id ? ({ ...element, ...patch } as DesignElement) : element,
		),
	};
};

const messagesOf = (value: unknown) => {
	const result = v.safeParse(designV2Schema, value);
	return result.success ? [] : result.issues.map((issue) => issue.message);
};

describe("certificateDesignSchema", () => {
	test("un blob sin versión se lee como v1, sin añadirle la versión", () => {
		const parsed = v.parse(certificateDesignSchema, LEGACY_DEFAULT_DESIGN_V1);

		expect(parsed).toEqual(LEGACY_DEFAULT_DESIGN_V1);
		expect(isDesignV2(parsed)).toBe(false);
	});

	test("un v2 se lee como v2", () => {
		const parsed = v.parse(certificateDesignSchema, design());
		expect(isDesignV2(parsed)).toBe(true);
	});

	test("una versión desconocida no valida", () => {
		expect(v.safeParse(certificateDesignSchema, { version: 3 }).success).toBe(
			false,
		);
	});

	test("algo que no es objeto no valida", () => {
		expect(v.safeParse(certificateDesignSchema, "x").success).toBe(false);
	});
});

describe("designV2Schema", () => {
	test("los tres presets son válidos", () => {
		for (const preset of Object.values(PRESETS)) {
			expect(messagesOf(preset)).toEqual([]);
		}
	});

	test("exige exactamente un QR", () => {
		const base = design();
		const withoutQr = {
			...base,
			elements: base.elements.filter((e) => e.type !== "qr"),
		};
		expect(messagesOf(withoutQr)).toContain(
			"El certificado lleva exactamente un QR de verificación.",
		);
	});

	test("exige exactamente un folio", () => {
		const base = design();
		const folio = base.elements.find(
			(e) => e.type === "folio",
		) as DesignElement;
		const twice = {
			...base,
			elements: [...base.elements, { ...folio, id: "folio-2" }],
		};
		expect(messagesOf(twice)).toContain(
			"El certificado lleva exactamente un folio.",
		);
	});

	test("ni el QR ni el folio se ocultan", () => {
		expect(messagesOf(withElement("qr", { hidden: true }))).toContain(
			"El QR de verificación y el folio no se pueden ocultar.",
		);
	});

	test("el QR y el folio quedan dentro de la página, también rotados", () => {
		expect(messagesOf(withElement("folio", { x: 800 }))).toContain(
			"El QR de verificación y el folio deben quedar dentro de la página.",
		);
		expect(messagesOf(withElement("qr", { x: 780, rotation: 90 }))).toEqual([]);
	});

	test("el QR es cuadrado, legible, en ángulo recto y opaco", () => {
		expect(messagesOf(withElement("qr", { h: 70 }))).toContain(
			"El QR de verificación debe ser cuadrado.",
		);
		expect(messagesOf(withElement("qr", { w: 40, h: 40 }))).toContain(
			"El QR de verificación debe medir al menos 2 cm para poder leerse.",
		);
		expect(messagesOf(withElement("qr", { rotation: 30 }))).toContain(
			"El QR de verificación solo gira en ángulos rectos.",
		);
		expect(messagesOf(withElement("qr", { opacity: 0.5 }))).toContain(
			"El QR de verificación no lleva transparencia.",
		);
	});

	test("dos elementos no comparten id", () => {
		const base = design();
		const [first, second] = base.elements;
		const clash = {
			...base,
			elements: [first, { ...second, id: first.id }, ...base.elements.slice(2)],
		};
		expect(messagesOf(clash)).toContain(
			"Dos elementos no pueden tener el mismo identificador.",
		);
	});

	test("un texto no usa campos que no existen", () => {
		expect(
			messagesOf(withElement("otorga", { content: "Hola {nombre}" })),
		).toContain("El texto usa un campo dinámico que no existe.");
	});

	test("la tipografía tiene que tener ese grosor", () => {
		expect(
			messagesOf(withElement("otorga", { fontId: "great-vibes", weight: 700 })),
		).toContain("La tipografía no tiene ese grosor o estilo.");
	});

	test("los colores son #rrggbb", () => {
		expect(messagesOf(withElement("franja", { fill: "red;}" }))).toContain(
			"El relleno debe tener la forma #RRGGBB.",
		);
	});

	test("las coordenadas son números finitos", () => {
		expect(messagesOf(withElement("franja", { x: Number.NaN }))).not.toEqual(
			[],
		);
		expect(messagesOf(withElement("franja", { w: 0 }))).not.toEqual([]);
	});

	test("una imagen solo apunta al proxy de storage", () => {
		const base = design();
		const image = {
			...base.elements[0],
			id: "img",
			type: "image",
			src: { kind: "asset", ref: "https://evil.example/x.png", role: "image" },
			fit: "contain",
		};
		expect(
			messagesOf({ ...base, elements: [...base.elements, image] }),
		).toContain("La imagen debe estar subida a la plataforma.");
	});

	test("un logo es uno integrado o un uuid", () => {
		const logo = design().elements.find(
			(e) => e.id === "logo",
		) as DesignElement;
		const base = design();
		const other = { ...logo, src: { kind: "logo", logoId: "../x" } };
		expect(
			messagesOf({
				...base,
				elements: base.elements.map((e) => (e.id === "logo" ? other : e)),
			}),
		).toContain("El logo no es válido.");
	});

	test("con PDF de fondo la página mide lo mismo que el PDF", () => {
		const background = {
			kind: "pdf",
			pdfRef: "/api/storage?key=a",
			rasterRef: "/api/storage?key=b",
			rasterDpi: 300,
			widthPt: 600,
			heightPt: 400,
		} as const;
		expect(messagesOf(design({ background }))).toContain(
			"Con un PDF de fondo, la página mide lo mismo que el PDF.",
		);
	});

	test("la página está entre A7 y A3 por lado", () => {
		const page = { ...design().page, widthPt: 5000 };
		expect(messagesOf(design({ page }))).not.toEqual([]);
	});

	test("el formato del folio lleva {seq}", () => {
		expect(messagesOf(design({ folioFormat: "{year}" }))).toContain(
			"El formato del folio debe incluir {seq}.",
		);
	});

	test("no admite más de 150 elementos", () => {
		const base = design();
		const extra = Array.from({ length: 150 }, (_, index) => ({
			...base.elements[0],
			id: `x-${index}`,
		}));
		expect(
			messagesOf({ ...base, elements: [...base.elements, ...extra] }),
		).toContain("El certificado no puede tener más de 150 elementos.");
	});
});
