import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ICradle } from "@/shared/di/container.types";
import { contentTypeForKey } from "@/shared/storage/mime";
import { bucketForKey } from "@/shared/storage/storage.policy";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import {
	CERTIFICATE_FONT_DIR,
	CERTIFICATE_FONT_FILES,
	CERTIFICATE_LOGO_PATH,
	type CertificateFontFile,
} from "../domain/certificate.config";
import { CertificateExportFailedError } from "../domain/certificate.errors";
import type { ICertificateAssetSource } from "../domain/certificate.exporter";
import { courseOfSignatureKey } from "../domain/certificate.rules";
import type { CertificateAssets } from "../domain/certificate.types";

type Dependencies = {
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
};

/**
 * Dónde están los estáticos: `public/` en desarrollo y `build/client/` en la
 * imagen, que no copia `public/`.
 */
const STATIC_ROOTS = ["public", path.join("build", "client")];

const staticRoot = (): string => {
	const probe = CERTIFICATE_LOGO_PATH.slice(1);
	const root = STATIC_ROOTS.map((candidate) => path.resolve(candidate)).find(
		(candidate) => existsSync(path.join(candidate, probe)),
	);
	if (!root) throw new CertificateExportFailedError("static assets not found");
	return root;
};

const dataUri = (contentType: string, bytes: Buffer): string =>
	`data:${contentType};base64,${bytes.toString("base64")}`;

const readStatic = async (root: string, publicPath: string) =>
	readFile(path.join(root, publicPath.slice(1)));

export const createCertificateAssetSource = ({
	storageProvider,
	storageBucket,
	storagePublicBucket,
}: Dependencies): ICertificateAssetSource => {
	// Fuentes y logo no cambian mientras vive el proceso: se leen una vez.
	let staticAssets: Promise<Omit<CertificateAssets, "signatures">> | null =
		null;

	const loadStatic = () => {
		staticAssets ??= (async () => {
			const root = staticRoot();
			const fonts = Object.fromEntries(
				await Promise.all(
					CERTIFICATE_FONT_FILES.map(async ([file]) => [
						file,
						dataUri(
							"font/woff2",
							await readStatic(
								root,
								`${CERTIFICATE_FONT_DIR}/ITCAvantGardeStd-${file}.woff2`,
							),
						),
					]),
				),
			) as Record<CertificateFontFile, string>;

			return {
				fonts,
				logo: dataUri(
					"image/png",
					await readStatic(root, CERTIFICATE_LOGO_PATH),
				),
			};
		})().catch((error) => {
			staticAssets = null;
			throw error;
		});
		return staticAssets;
	};

	const loadSignature = async (ref: string): Promise<[string, string]> => {
		const key = getKeyFromUrl(ref);
		// Solo firmas: el snapshot ya pasó por `isOwnSignatureRef`, pero de aquí
		// no sale un objeto de otra carpeta aunque alguien edite la fila a mano.
		if (!key || key.includes("..") || !courseOfSignatureKey(key)) {
			throw new CertificateExportFailedError("signature reference is invalid");
		}
		if (!storageBucket) throw new Error("STORAGE_BUCKET_NAME no configurado");

		const bucket = bucketForKey(key, {
			defaultBucket: storageBucket,
			publicBucket: storagePublicBucket,
		});
		try {
			return [
				ref,
				dataUri(
					contentTypeForKey(key),
					await storageProvider.getFile(bucket, key),
				),
			];
		} catch {
			throw new CertificateExportFailedError("signature image is unreadable");
		}
	};

	return {
		async load(signatureRefs) {
			const [assets, signatures] = await Promise.all([
				loadStatic(),
				Promise.all([...new Set(signatureRefs)].map(loadSignature)),
			]);
			return { ...assets, signatures: Object.fromEntries(signatures) };
		},
	};
};
