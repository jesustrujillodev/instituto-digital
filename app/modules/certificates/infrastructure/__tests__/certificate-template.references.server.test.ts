import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import type {
	CertificateDesignV2,
	CertificateTemplate,
} from "../../domain/certificate.types";
import { PRESETS } from "../../domain/design/design.presets";
import type { DesignElement } from "../../domain/design/design-v2.schema";
import {
	createCertificateTemplateReferenceSource,
	TEMPLATES_PATH,
} from "../certificate-template.references.server";

const TEMPLATE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const USED = `documentos/plantillas-certificado/${TEMPLATE}/imagenes/sello.png`;
const STALE = `documentos/plantillas-certificado/${TEMPLATE}/imagenes/viejo.png`;
const logo = PRESETS.institucional.elements.find(
	(e) => e.id === "logo",
) as DesignElement;

const template: CertificateTemplate = {
	documentId: TEMPLATE,
	name: "Institucional 2026",
	description: null,
	scope: "INSTITUTIONAL",
	dependencyId: null,
	dependencyName: null,
	design: {
		...PRESETS.institucional,
		elements: [
			...PRESETS.institucional.elements,
			{
				...logo,
				id: "sello",
				src: { kind: "asset", ref: toProxyRef(USED), role: "image" },
			} as DesignElement,
		],
	},
	archivedAt: null,
	updatedAt: new Date(),
};

const createSource = () => {
	const saved: {
		documentId: string;
		design: CertificateDesignV2;
		by: number | null;
	}[] = [];
	const certificateTemplateRepository = {
		findByDocumentIds: async (ids: readonly string[]) =>
			ids.includes(TEMPLATE) ? [template] : [],
		saveDesign: async (
			documentId: string,
			design: CertificateDesignV2,
			by: number | null,
		) => {
			saved.push({ documentId, design, by });
		},
	} as unknown as ICradle["certificateTemplateRepository"];
	return {
		source: createCertificateTemplateReferenceSource({
			certificateTemplateRepository,
		}),
		saved,
	};
};

describe("recursos de plantillas en storage", () => {
	test("solo lo que el diseño usa está referenciado", async () => {
		const { source } = createSource();

		expect(await source.findByKeys([USED, STALE, "media/x.png"])).toEqual([
			{
				key: USED,
				owner: "certificate-template",
				label: "Institucional 2026",
				detail: "Imagen de la plantilla",
				href: `${TEMPLATES_PATH}/${TEMPLATE}/editor`,
			},
		]);
		expect(await source.findByKeys(["media/x.png"])).toEqual([]);
	});

	test("soltar quita la imagen del diseño, sin autor", async () => {
		const { source, saved } = createSource();

		expect(await source.release([USED])).toBe(1);
		expect(saved[0].by).toBeNull();
		expect(saved[0].design.elements.some((e) => e.id === "sello")).toBe(false);
		expect(await source.release([STALE])).toBe(0);
	});

	test("nombra la raíz y la carpeta de cada plantilla", async () => {
		const { source } = createSource();

		expect(
			await source.describeFolders([
				"documentos/plantillas-certificado/",
				`documentos/plantillas-certificado/${TEMPLATE}/`,
				`documentos/plantillas-certificado/${TEMPLATE}/imagenes/`,
			]),
		).toEqual([
			{
				prefix: "documentos/plantillas-certificado/",
				label: "Plantillas de certificado",
				href: TEMPLATES_PATH,
			},
			{
				prefix: `documentos/plantillas-certificado/${TEMPLATE}/`,
				label: "Institucional 2026",
				href: `${TEMPLATES_PATH}/${TEMPLATE}/editor`,
			},
		]);
		expect(await source.describeFolders(["media/"])).toEqual([]);
	});
});
