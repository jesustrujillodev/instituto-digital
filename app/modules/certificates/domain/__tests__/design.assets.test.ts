import { describe, expect, test } from "vitest";
import {
	assetManifestOf,
	backgroundPdfRefOf,
	exportProfileOf,
	issuedAssetRefsOf,
	logoIdsOf,
	pageBoxOf,
	storageRefsOf,
	withoutAssetRefs,
} from "../design/design.assets";
import { PRESETS } from "../design/design.presets";
import { LEGACY_DEFAULT_DESIGN_V1 } from "../design/design-v1.schema";
import type {
	CertificateDesignV2,
	DesignElement,
} from "../design/design-v2.schema";

const UPLOADED_LOGO = "00000000-0000-4000-8000-000000000001";
const IMAGE =
	"/api/storage?key=documentos%2Fcertificados%2Fc%2Fimagenes%2Fa.png";
const HIDDEN =
	"/api/storage?key=documentos%2Fcertificados%2Fc%2Fimagenes%2Fb.png";
const SIGNATURE = "/api/storage?key=documentos%2Ffirmas%2Fc%2Fs.png";

const logo = PRESETS.institucional.elements.find(
	(e) => e.id === "logo",
) as DesignElement;

const design: CertificateDesignV2 = {
	...structuredClone(PRESETS.institucional),
	background: {
		kind: "pdf",
		pdfRef: "/api/storage?key=documentos%2Fcertificados%2Fc%2Ffondos%2Ff.pdf",
		rasterRef:
			"/api/storage?key=documentos%2Fcertificados%2Fc%2Ffondos%2Ff.webp",
		rasterDpi: 300,
		widthPt: 841.89,
		heightPt: 595.28,
	},
	elements: [
		...PRESETS.institucional.elements,
		{ ...logo, id: "subido", src: { kind: "logo", logoId: UPLOADED_LOGO } },
		{ ...logo, id: "img", src: { kind: "asset", ref: IMAGE, role: "image" } },
		{
			...logo,
			id: "oculta",
			hidden: true,
			src: { kind: "asset", ref: HIDDEN, role: "image" },
		},
	] as DesignElement[],
};

const v1WithSignature = {
	...LEGACY_DEFAULT_DESIGN_V1,
	signatories: [
		{ ...LEGACY_DEFAULT_DESIGN_V1.signatories[0], signatureUrl: SIGNATURE },
		{
			...LEGACY_DEFAULT_DESIGN_V1.signatories[1],
			enabled: false,
			signatureUrl: IMAGE,
		},
	],
} as typeof LEGACY_DEFAULT_DESIGN_V1;

describe("pageBoxOf y exportProfileOf", () => {
	test("el v1 conserva su lienzo y su exportación de siempre", () => {
		expect(pageBoxOf(LEGACY_DEFAULT_DESIGN_V1)).toEqual({
			width: 1100,
			height: 780,
		});
		expect(exportProfileOf(LEGACY_DEFAULT_DESIGN_V1, "png")).toEqual({
			format: "png",
			viewport: { width: 1100, height: 780, deviceScaleFactor: 2 },
			pdfPage: { mode: "px", width: 1100, height: 780 },
			clip: null,
			transparent: false,
		});
	});

	test("el v2 exporta en su tamaño de página, PNG a 300 ppp", () => {
		const profile = exportProfileOf(PRESETS.institucional, "pdf", {
			transparent: true,
		});
		expect(profile.viewport).toEqual({
			width: 1123,
			height: 794,
			deviceScaleFactor: 300 / 96,
		});
		expect(profile.pdfPage).toEqual({ mode: "css" });
		expect(profile.transparent).toBe(true);
		expect(profile.clip?.width).toBeCloseTo(1122.52, 2);
	});
});

describe("recursos", () => {
	test("el manifiesto v1 pide lo heredado y las firmas activas", () => {
		expect(assetManifestOf(v1WithSignature)).toEqual({
			legacy: true,
			faces: [],
			logoIds: [],
			imageRefs: [SIGNATURE],
		});
	});

	test("el manifiesto v2 trae solo lo impreso", () => {
		const manifest = assetManifestOf(design);
		expect(manifest.legacy).toBe(false);
		expect(manifest.logoIds).toEqual(["ayto-blanco", UPLOADED_LOGO]);
		expect(manifest.imageRefs).toContain(IMAGE);
		expect(manifest.imageRefs).not.toContain(HIDDEN);
		expect(manifest.imageRefs).toContain(
			design.background.kind === "pdf" ? design.background.rasterRef : "",
		);
		expect(manifest.faces).toContain("eb-garamond-400-italic");
	});

	test("las referencias de storage incluyen lo oculto y el fondo", () => {
		const refs = storageRefsOf(design);
		expect(refs).toContain(HIDDEN);
		expect(refs).toHaveLength(4);
		expect(storageRefsOf(v1WithSignature)).toEqual([SIGNATURE, IMAGE]);
	});

	test("el fondo PDF y los logos del diseño", () => {
		expect(backgroundPdfRefOf(design)).toContain("f.pdf");
		expect(backgroundPdfRefOf(PRESETS.institucional)).toBeNull();
		expect(logoIdsOf(design)).toEqual(["ayto-blanco", UPLOADED_LOGO]);
		expect(logoIdsOf(LEGACY_DEFAULT_DESIGN_V1)).toEqual([]);
	});

	test("lo que imprime una emisión, con los logos subidos como logo:<id>", () => {
		const refs = issuedAssetRefsOf(design, (id) => id === "ayto-blanco");
		expect(refs).toContain(IMAGE);
		expect(refs).toContain(`logo:${UPLOADED_LOGO}`);
		expect(refs).not.toContain("logo:ayto-blanco");
		expect(refs.some((ref) => ref.endsWith("f.pdf"))).toBe(true);
	});
});

describe("withoutAssetRefs", () => {
	test("en v1 deja la firma sin imagen", () => {
		const { design: next, removed } = withoutAssetRefs(
			v1WithSignature,
			new Set([SIGNATURE]),
		);
		expect(removed).toBe(1);
		expect(
			"signatories" in next && next.signatories[0].signatureUrl,
		).toBeNull();
	});

	test("en v2 quita las imágenes y devuelve el fondo a blanco", () => {
		const pdf =
			design.background.kind === "pdf" ? design.background.pdfRef : "";
		const { design: next, removed } = withoutAssetRefs(
			design,
			new Set([IMAGE, pdf]),
		);
		expect(removed).toBe(2);
		expect(
			"elements" in next && next.elements.some((e) => e.id === "img"),
		).toBe(false);
		expect("background" in next && next.background).toEqual({
			kind: "color",
			color: "#ffffff",
		});
	});

	test("sin coincidencias no quita nada", () => {
		expect(withoutAssetRefs(design, new Set(["x"])).removed).toBe(0);
	});
});
