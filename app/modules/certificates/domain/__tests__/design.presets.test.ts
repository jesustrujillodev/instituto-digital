import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	blankDesign,
	DEFAULT_CERTIFICATE_DESIGN,
	migrateV1ToV2,
	PRESETS,
} from "../design/design.presets";
import {
	CERTIFICATE_TEMPLATE_IDS,
	LEGACY_DEFAULT_DESIGN_V1,
} from "../design/design-v1.schema";
import { designV2Schema } from "../design/design-v2.schema";

const contentOf = (design: ReturnType<typeof migrateV1ToV2>, id: string) => {
	const element = design.elements.find((e) => e.id === id);
	return element && element.type === "text" ? element.content : undefined;
};

describe("presets", () => {
	test("el diseño por defecto es el institucional", () => {
		expect(DEFAULT_CERTIFICATE_DESIGN).toBe(PRESETS.institucional);
	});

	test.each(CERTIFICATE_TEMPLATE_IDS)("%s es un A4 horizontal válido", (id) => {
		const preset = PRESETS[id];
		expect(v.safeParse(designV2Schema, preset).success).toBe(true);
		expect(preset.page).toMatchObject({
			preset: "A4",
			orientation: "landscape",
		});
	});
});

describe("migrateV1ToV2", () => {
	test.each(CERTIFICATE_TEMPLATE_IDS)(
		"convierte %s en un v2 válido",
		(templateId) => {
			const migrated = migrateV1ToV2({
				...LEGACY_DEFAULT_DESIGN_V1,
				templateId,
			});
			expect(v.safeParse(designV2Schema, migrated).success).toBe(true);
		},
	);

	test("lleva acento, subtítulo, descripción, firmantes y folio", () => {
		const migrated = migrateV1ToV2({
			...LEGACY_DEFAULT_DESIGN_V1,
			accentColor: "#225B4F",
			subtitle: "Programa {anual} 2026",
			description: "Texto propio",
			folioFormat: "OP-{seq}",
			signatories: [
				{
					name: "Ana",
					role: "Capacitadora",
					enabled: true,
					signatureUrl: "/api/storage?key=documentos%2Ffirmas%2Fc%2Fa.png",
				},
				{ name: "Luis", role: "Titular", enabled: false, signatureUrl: null },
			],
		});

		expect(migrated.folioFormat).toBe("OP-{seq}");
		expect(contentOf(migrated, "subtitulo")).toBe("Programa (anual) 2026");
		expect(contentOf(migrated, "descripcion")).toBe("Texto propio");
		expect(contentOf(migrated, "firma-1-nombre")).toBe("Ana");
		expect(
			migrated.elements.find((e) => e.id === "firma-1-imagen"),
		).toMatchObject({
			src: { kind: "asset", role: "signature" },
		});
		expect(migrated.elements.some((e) => e.id.startsWith("firma-2"))).toBe(
			false,
		);
		expect(migrated.elements.find((e) => e.id === "franja")).toMatchObject({
			fill: "#225b4f",
		});
	});

	test("sin descripción propia imprime la del curso", () => {
		expect(
			contentOf(migrateV1ToV2(LEGACY_DEFAULT_DESIGN_V1), "descripcion"),
		).toBe("{descripcion}");
	});

	test("sin subtítulo no hay elemento de subtítulo", () => {
		const migrated = migrateV1ToV2(LEGACY_DEFAULT_DESIGN_V1);
		expect(migrated.elements.some((e) => e.id === "subtitulo")).toBe(false);
	});
});

describe("blankDesign", () => {
	test.each([
		["A4", "landscape", 841.89, 595.28],
		["A4", "portrait", 595.28, 841.89],
		["LETTER", "landscape", 792, 612],
		["LETTER", "portrait", 612, 792],
	] as const)(
		"%s %s: solo QR y folio, dentro de la página",
		(preset, orientation, widthPt, heightPt) => {
			const blank = blankDesign({ preset, orientation, widthPt, heightPt });

			expect(v.safeParse(designV2Schema, blank).success).toBe(true);
			expect(blank.elements.map((e) => e.type)).toEqual(["qr", "folio"]);
			expect(blank.background).toEqual({ kind: "color", color: "#ffffff" });
		},
	);

	test("conserva el formato de folio que se le pase", () => {
		const page = PRESETS.institucional.page;
		expect(blankDesign(page, "SOP-{seq}").folioFormat).toBe("SOP-{seq}");
	});
});
