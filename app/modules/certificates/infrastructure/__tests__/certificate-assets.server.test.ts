import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import { CERTIFICATE_ERROR_CODES } from "../../domain/certificate.errors";
import type { AssetManifest } from "../../domain/design/design.assets";
import { createCertificateAssetSource } from "../certificate-assets.server";

const COURSE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SIGNATURE = `documentos/firmas/${COURSE}/firma.png`;
const IMAGE = `documentos/certificados/${COURSE}/imagenes/sello.svg`;
const PDF = `documentos/certificados/${COURSE}/fondos/fondo.pdf`;

const manifestOf = (overrides: Partial<AssetManifest> = {}): AssetManifest => ({
	legacy: false,
	faces: [],
	logoIds: [],
	imageRefs: [],
	...overrides,
});

const createHarness = (options: { unreadable?: boolean } = {}) => {
	const reads: { bucket: string; key: string }[] = [];

	const storageProvider = {
		getFile: async (bucket: string, key: string) => {
			reads.push({ bucket, key });
			if (options.unreadable) throw new Error("NoSuchKey");
			return Buffer.from(`BYTES:${key}`);
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

const dataOf = (type: string, key: string) =>
	`data:${type};base64,${Buffer.from(`BYTES:${key}`).toString("base64")}`;

describe("certificateAssetSource.load", () => {
	test("v1: Avant Garde, logo blanco y firmas", async () => {
		const { source, reads } = createHarness();
		const ref = toProxyRef(SIGNATURE);

		const assets = await source.load(
			manifestOf({ legacy: true, imageRefs: [ref] }),
			{},
		);

		expect(assets.logo).toMatch(/^data:image\/png;base64,/);
		expect(Object.keys(assets.fonts ?? {})).toEqual([
			"XLt",
			"Bk",
			"Md",
			"Demi",
			"Bold",
		]);
		expect(assets.images).toEqual({ [ref]: dataOf("image/png", SIGNATURE) });
		expect(reads).toEqual([{ bucket: "privado", key: SIGNATURE }]);
	});

	test("v2: solo las caras, logos e imágenes del manifiesto", async () => {
		const { source, reads } = createHarness();
		const ref = toProxyRef(IMAGE);

		const assets = await source.load(
			manifestOf({
				faces: ["eb-garamond-400"],
				logoIds: ["ayto-blanco", "subido"],
				imageRefs: [ref],
			}),
			{
				"ayto-blanco": { kind: "builtin", path: "/assets/aytoBco.png" },
				subido: { kind: "storage", key: "media/logos/color.png" },
			},
		);

		expect(assets.fonts).toBeUndefined();
		expect(Object.keys(assets.faces)).toEqual(["eb-garamond-400"]);
		expect(assets.faces["eb-garamond-400"]).toMatch(
			/^data:font\/woff2;base64,/,
		);
		expect(assets.logos["ayto-blanco"]).toMatch(/^data:image\/png;base64,/);
		expect(assets.logos.subido).toBe(
			dataOf("image/png", "media/logos/color.png"),
		);
		expect(assets.images[ref]).toBe(dataOf("image/svg+xml", IMAGE));
		// El logo subido sale del bucket público: está bajo `media/`.
		expect(reads).toContainEqual({
			bucket: "publico",
			key: "media/logos/color.png",
		});
	});

	test("un objeto de storage se lee una vez aunque se pida dos", async () => {
		const { source, reads } = createHarness();
		const ref = toProxyRef(IMAGE);

		await source.load(manifestOf({ imageRefs: [ref] }), {});
		await source.load(manifestOf({ imageRefs: [ref] }), {});

		expect(reads).toHaveLength(1);
	});

	test.each([
		[
			"fuera de las carpetas del certificado",
			toProxyRef("media/portadas/a.png"),
		],
		[
			"con una ruta relativa",
			toProxyRef(`documentos/firmas/${COURSE}/../x.png`),
		],
		["que no es del proxy", "https://externo.test/firma.png"],
	])("una imagen %s no se lee", async (_case, ref) => {
		const { source, reads } = createHarness();

		await expect(
			source.load(manifestOf({ imageRefs: [ref] }), {}),
		).rejects.toMatchObject({
			code: CERTIFICATE_ERROR_CODES.EXPORT_FAILED,
		});
		expect(reads).toEqual([]);
	});

	test.each([
		["sin origen", {}],
		[
			"fuera de la carpeta de logos",
			{ x: { kind: "storage", key: "documentos/x.png" } },
		],
	] as const)("un logo %s frena la exportación", async (_case, logos) => {
		const { source } = createHarness();

		await expect(
			source.load(manifestOf({ logoIds: ["x"] }), logos),
		).rejects.toMatchObject({
			code: CERTIFICATE_ERROR_CODES.EXPORT_FAILED,
		});
	});

	test("una cara que no es del catálogo frena la exportación", async () => {
		const { source } = createHarness();

		await expect(
			source.load(manifestOf({ faces: ["comic-sans-400"] }), {}),
		).rejects.toMatchObject({
			code: CERTIFICATE_ERROR_CODES.EXPORT_FAILED,
		});
	});

	test("una imagen que ya no está en el bucket frena la exportación", async () => {
		const { source } = createHarness({ unreadable: true });

		await expect(
			source.load(manifestOf({ imageRefs: [toProxyRef(SIGNATURE)] }), {}),
		).rejects.toMatchObject({ code: CERTIFICATE_ERROR_CODES.EXPORT_FAILED });
	});
});

describe("certificateAssetSource.loadBackgroundPdf", () => {
	test("lee el PDF saneado del curso", async () => {
		const { source } = createHarness();

		const bytes = await source.loadBackgroundPdf(toProxyRef(PDF));

		expect(Buffer.from(bytes).toString()).toBe(`BYTES:${PDF}`);
	});

	test.each([
		["fuera de la carpeta", toProxyRef("media/x.pdf")],
		["ilegible", toProxyRef(PDF)],
	])("un fondo %s frena la exportación", async (name, ref) => {
		const { source } = createHarness({ unreadable: name === "ilegible" });

		await expect(source.loadBackgroundPdf(ref)).rejects.toMatchObject({
			code: CERTIFICATE_ERROR_CODES.EXPORT_FAILED,
		});
	});
});
