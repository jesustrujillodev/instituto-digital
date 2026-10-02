import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { STORAGE_ERROR_CODES } from "@/shared/storage/storage.errors";
import type { InstitutionalLogo } from "../../domain/certificate.types";
import {
	createCertificateLogoReferenceSource,
	LOGOS_ADMIN_PATH,
} from "../certificate-logo.references.server";

const logo: InstitutionalLogo = {
	documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
	name: "Logo a color",
	storageKey: "media/logos/color-1.png",
	contentType: "image/png",
	widthPx: 600,
	heightPx: 200,
	archivedAt: new Date(),
	createdAt: new Date(),
	previousDocumentId: null,
};

const createSource = () => {
	const lookups: string[][] = [];
	const certificateLogoRepository = {
		findByStorageKeys: async (keys: readonly string[]) => {
			lookups.push([...keys]);
			return keys.includes(logo.storageKey) ? [logo] : [];
		},
	} as unknown as ICradle["certificateLogoRepository"];
	return {
		source: createCertificateLogoReferenceSource({ certificateLogoRepository }),
		lookups,
	};
};

describe("logos institucionales en storage", () => {
	test("un logo con fila está referenciado, aunque esté archivado", async () => {
		const { source, lookups } = createSource();

		expect(
			await source.findByKeys([logo.storageKey, "media/portadas/a.png"]),
		).toEqual([
			{
				key: logo.storageKey,
				owner: "institutional-logo",
				label: "Logo a color",
				detail: "Logo archivado",
				href: LOGOS_ADMIN_PATH,
			},
		]);
		expect(lookups).toEqual([[logo.storageKey]]);
	});

	test("nunca se suelta: los certificados emitidos lo nombran", async () => {
		const { source } = createSource();

		await expect(source.release([logo.storageKey])).rejects.toMatchObject({
			code: STORAGE_ERROR_CODES.OBJECT_LOCKED,
		});
		expect(await source.release(["media/logos/huerfano.png"])).toBe(0);
	});

	test("nombra su carpeta", async () => {
		const { source } = createSource();

		expect(await source.describeFolders(["media/logos/", "media/"])).toEqual([
			{
				prefix: "media/logos/",
				label: "Logos institucionales",
				href: LOGOS_ADMIN_PATH,
			},
		]);
		expect(await source.describeFolders(["media/"])).toEqual([]);
	});
});
