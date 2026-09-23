import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { CERTIFICATE_ERROR_CODES } from "../../domain/certificate.errors";
import { createCertificateAssetSource } from "../certificate-assets.server";

const SIGNATURE =
	"documentos/firmas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/firma.png";

const createHarness = (options: { unreadable?: boolean } = {}) => {
	const reads: { bucket: string; key: string }[] = [];

	const storageProvider = {
		getFile: async (bucket: string, key: string) => {
			reads.push({ bucket, key });
			if (options.unreadable) throw new Error("NoSuchKey");
			return Buffer.from("FIRMA");
		},
	} as unknown as ICradle["storageProvider"];

	return {
		source: createCertificateAssetSource({
			storageProvider,
			storageBucket: "privado",
			storagePublicBucket: "publico",
		}),
		reads,
	};
};

describe("certificateAssetSource.load", () => {
	test("incrusta fuentes, logo y firmas como data URIs", async () => {
		const { source, reads } = createHarness();
		const ref = toProxyRef(SIGNATURE);

		const assets = await source.load([ref, ref]);

		expect(assets.logo).toMatch(/^data:image\/png;base64,/);
		expect(Object.keys(assets.fonts)).toEqual([
			"XLt",
			"Bk",
			"Md",
			"Demi",
			"Bold",
		]);
		expect(assets.fonts.Demi).toMatch(/^data:font\/woff2;base64,/);
		expect(assets.signatures).toEqual({
			[ref]: `data:image/png;base64,${Buffer.from("FIRMA").toString("base64")}`,
		});
		// Privada: sale del bucket privado, y una sola vez aunque se repita.
		expect(reads).toEqual([{ bucket: "privado", key: SIGNATURE }]);
	});

	test.each([
		["fuera de la carpeta de firmas", toProxyRef("media/portadas/a.png")],
		[
			"con una ruta relativa",
			toProxyRef("documentos/firmas/../secretos/a.png"),
		],
		["que no es del proxy", "https://externo.test/firma.png"],
	])("una referencia %s no se lee", async (_case, ref) => {
		const { source, reads } = createHarness();

		await expect(source.load([ref])).rejects.toMatchObject({
			code: CERTIFICATE_ERROR_CODES.EXPORT_FAILED,
		});
		expect(reads).toEqual([]);
	});

	test("una firma que ya no está en el bucket frena la exportación", async () => {
		const { source } = createHarness({ unreadable: true });

		await expect(source.load([toProxyRef(SIGNATURE)])).rejects.toMatchObject({
			code: CERTIFICATE_ERROR_CODES.EXPORT_FAILED,
		});
	});
});
