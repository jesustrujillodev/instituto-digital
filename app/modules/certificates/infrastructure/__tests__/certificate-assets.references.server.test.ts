import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { STORAGE_ERROR_CODES } from "@/shared/storage/storage.errors";
import type { CertificateOwner } from "../../domain/certificate.repository";
import type { CertificateDesign } from "../../domain/certificate.types";
import { PRESETS } from "../../domain/design/design.presets";
import { LEGACY_DEFAULT_DESIGN_V1 as DEFAULT_CERTIFICATE_DESIGN } from "../../domain/design/design-v1.schema";
import type { DesignElement } from "../../domain/design/design-v2.schema";
import { createCertificateAssetReferenceSource } from "../certificate-assets.references.server";

const COURSE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IN_DRAFT = `documentos/firmas/${COURSE}/borrador.png`;
const IN_PUBLISHED = `documentos/firmas/${COURSE}/publicada.png`;
const STALE = `documentos/firmas/${COURSE}/vieja.png`;

const withRef = (key: string | null): CertificateDesign => ({
	...DEFAULT_CERTIFICATE_DESIGN,
	signatories: [
		{
			...DEFAULT_CERTIFICATE_DESIGN.signatories[0],
			signatureUrl: key ? toProxyRef(key) : null,
		},
		DEFAULT_CERTIFICATE_DESIGN.signatories[1],
	],
});

const owner: CertificateOwner = {
	courseDocumentId: COURSE,
	courseTitle: "Seguridad en obra",
	record: {
		draft: withRef(IN_DRAFT),
		published: withRef(IN_PUBLISHED),
		publishedAt: new Date(),
		exists: true,
	},
	issuedAssetRefs: [],
};

const createHarness = (current: CertificateOwner = owner) => {
	const calls = {
		lookups: [] as string[][],
		removed: [] as { course: string; refs: readonly string[] }[],
	};

	const certificateRepository = {
		findByCourseDocumentIds: async (ids: readonly string[]) => {
			calls.lookups.push([...ids]);
			return ids.includes(COURSE) ? [current] : [];
		},
		removeAssetRefs: async (course: string, refs: readonly string[]) => {
			calls.removed.push({ course, refs });
			return refs.length;
		},
	} as unknown as ICradle["certificateRepository"];

	return {
		source: createCertificateAssetReferenceSource({
			certificateRepository,
		}),
		calls,
	};
};

describe("findByKeys", () => {
	test("una firma del borrador o del publicado está referenciada", async () => {
		const { source } = createHarness();

		const refs = await source.findByKeys([IN_DRAFT, IN_PUBLISHED, STALE]);

		expect(refs).toEqual([
			{
				key: IN_DRAFT,
				owner: "certificate",
				label: "Seguridad en obra",
				detail: "Firma del certificado",
				href: `/dashboard/capacitaciones/${COURSE}/certificado`,
			},
			expect.objectContaining({ key: IN_PUBLISHED }),
		]);
	});

	test("solo consulta los cursos que aparecen en las keys", async () => {
		const { source, calls } = createHarness();

		await source.findByKeys([
			IN_DRAFT,
			`documentos/firmas/${OTHER}/x.png`,
			"media/portadas/a.png",
		]);

		expect(calls.lookups).toEqual([[COURSE, OTHER]]);
	});

	test("sin keys de certificados no consulta nada", async () => {
		const { source, calls } = createHarness();

		expect(await source.findByKeys(["media/portadas/a.png"])).toEqual([]);
		expect(calls.lookups).toEqual([]);
	});
});

describe("release", () => {
	test("suelta las referencias por curso, en forma de proxy", async () => {
		const { source, calls } = createHarness();

		const released = await source.release([IN_DRAFT, "media/portadas/a.png"]);

		expect(released).toBe(1);
		expect(calls.removed).toEqual([
			{ course: COURSE, refs: [toProxyRef(IN_DRAFT)] },
		]);
	});
});

describe("describeFolders", () => {
	test("nombra la raíz y cada carpeta de curso por su título", async () => {
		const { source } = createHarness();

		const folders = await source.describeFolders([
			"documentos/firmas/",
			`documentos/firmas/${COURSE}/`,
			"media/",
		]);

		expect(folders).toEqual([
			{ prefix: "documentos/firmas/", label: "Firmas de certificados" },
			{
				prefix: `documentos/firmas/${COURSE}/`,
				label: "Seguridad en obra",
				href: `/dashboard/capacitaciones/${COURSE}/certificado`,
			},
		]);
	});

	test("ignora las carpetas ajenas", async () => {
		const { source, calls } = createHarness();

		expect(await source.describeFolders(["media/portadas/"])).toEqual([]);
		expect(calls.lookups).toEqual([]);
	});
});

describe("firmas de certificados emitidos", () => {
	const issuedOnly = { ...owner, issuedAssetRefs: [toProxyRef(STALE)] };

	test("una firma que solo imprime una emisión sigue referenciada", async () => {
		const { source } = createHarness(issuedOnly);

		expect(await source.findByKeys([STALE])).toEqual([
			expect.objectContaining({
				key: STALE,
				detail: "Firma de certificados emitidos",
			}),
		]);
	});

	// Borrarla dejaría sin firma un documento ya entregado.
	test("release la bloquea sin soltar nada", async () => {
		const { source, calls } = createHarness(issuedOnly);

		await expect(source.release([IN_DRAFT, STALE])).rejects.toMatchObject({
			code: STORAGE_ERROR_CODES.OBJECT_LOCKED,
			details: { keys: [STALE] },
		});
		expect(calls.removed).toEqual([]);
	});
});

describe("imágenes y fondos del editor libre", () => {
	const IMAGE = `documentos/certificados/${COURSE}/imagenes/sello.png`;
	const PDF = `documentos/certificados/${COURSE}/fondos/fondo.pdf`;
	const logo = PRESETS.institucional.elements.find(
		(e) => e.id === "logo",
	) as DesignElement;
	const v2: CertificateDesign = {
		...PRESETS.institucional,
		background: {
			kind: "pdf",
			pdfRef: toProxyRef(PDF),
			rasterRef: toProxyRef(
				`documentos/certificados/${COURSE}/fondos/fondo.webp`,
			),
			rasterDpi: 300,
			widthPt: 841.89,
			heightPt: 595.28,
		},
		elements: [
			...PRESETS.institucional.elements,
			{
				...logo,
				id: "img",
				src: { kind: "asset", ref: toProxyRef(IMAGE), role: "image" },
			} as DesignElement,
		],
	};
	const current: CertificateOwner = {
		...owner,
		record: { ...owner.record, draft: v2 },
		issuedAssetRefs: [toProxyRef(PDF)],
	};

	test("una imagen del diseño y un fondo emitido están referenciados", async () => {
		const { source } = createHarness(current);

		expect(await source.findByKeys([IMAGE, PDF])).toEqual([
			expect.objectContaining({ key: IMAGE, detail: "Imagen del certificado" }),
			expect.objectContaining({ key: PDF, detail: "Imagen del certificado" }),
		]);
	});

	test("el fondo que imprime una emisión no se suelta", async () => {
		const { source } = createHarness(current);

		await expect(source.release([PDF])).rejects.toMatchObject({
			code: STORAGE_ERROR_CODES.OBJECT_LOCKED,
		});
	});

	test("nombra la raíz y la carpeta del curso del editor libre", async () => {
		const { source } = createHarness(current);

		expect(
			await source.describeFolders([
				"documentos/certificados/",
				`documentos/certificados/${COURSE}/`,
				`documentos/certificados/${COURSE}/imagenes/`,
			]),
		).toEqual([
			{ prefix: "documentos/certificados/", label: "Imágenes de certificados" },
			{
				prefix: `documentos/certificados/${COURSE}/`,
				label: "Seguridad en obra",
				href: `/dashboard/capacitaciones/${COURSE}/certificado`,
			},
		]);
	});
});
