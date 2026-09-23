import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { STORAGE_ERROR_CODES } from "@/shared/storage/storage.errors";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../domain/certificate.config";
import type { CertificateOwner } from "../../domain/certificate.repository";
import type { CertificateDesign } from "../../domain/certificate.types";
import { createCertificateSignatureReferenceSource } from "../certificate-signature.references.server";

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
	issuedSignatureRefs: [],
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
		removeSignatureRefs: async (course: string, refs: readonly string[]) => {
			calls.removed.push({ course, refs });
			return refs.length;
		},
	} as unknown as ICradle["certificateRepository"];

	return {
		source: createCertificateSignatureReferenceSource({
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
				href: `/dashboard/cursos/${COURSE}/certificado`,
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

	test("sin keys de firmas no consulta nada", async () => {
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
				href: `/dashboard/cursos/${COURSE}/certificado`,
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
	const issuedOnly = { ...owner, issuedSignatureRefs: [toProxyRef(STALE)] };

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
