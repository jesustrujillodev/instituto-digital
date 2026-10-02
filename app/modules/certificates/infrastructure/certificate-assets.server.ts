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
import type {
	ICertificateAssetSource,
	LogoSource,
} from "../domain/certificate.exporter";
import type { CertificateAssets } from "../domain/certificate.types";
import { courseOfCertificateAssetKey } from "../domain/certificate-assets.rules";
import { INSTITUTIONAL_LOGO } from "../domain/certificate-logo.rules";
import { ALL_FACES } from "../domain/design/font-catalog";

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

/** Tope de la caché de objetos de storage. Sus keys llevan marca de tiempo: no cambian. */
const STORAGE_CACHE_BYTES = 64 * 1024 * 1024;

const staticRoot = (): string => {
	const probe = CERTIFICATE_LOGO_PATH.slice(1);
	const root = STATIC_ROOTS.map((candidate) => path.resolve(candidate)).find(
		(candidate) => existsSync(path.join(candidate, probe)),
	);
	if (!root) throw new CertificateExportFailedError("static assets not found");
	return root;
};

const dataUri = (contentType: string, bytes: Uint8Array): string =>
	`data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;

/** Una caché LRU por bytes: `Map` conserva el orden de inserción. */
const createByteCache = (limit: number) => {
	const entries = new Map<string, Buffer>();
	let size = 0;
	return {
		get(key: string) {
			const value = entries.get(key);
			if (value) {
				entries.delete(key);
				entries.set(key, value);
			}
			return value;
		},
		set(key: string, value: Buffer) {
			if (value.byteLength > limit) return;
			entries.set(key, value);
			size += value.byteLength;
			for (const [oldest, bytes] of entries) {
				if (size <= limit) break;
				entries.delete(oldest);
				size -= bytes.byteLength;
			}
		},
	};
};

export const createCertificateAssetSource = ({
	storageProvider,
	storageBucket,
	storagePublicBucket,
}: Dependencies): ICertificateAssetSource => {
	const statics = new Map<string, Promise<Buffer>>();
	const cache = createByteCache(STORAGE_CACHE_BYTES);
	let root: string | null = null;

	/** Un archivo de `public/`, leído una vez por proceso. */
	const readStatic = (publicPath: string): Promise<Buffer> => {
		let pending = statics.get(publicPath);
		if (!pending) {
			root ??= staticRoot();
			pending = readFile(path.join(root, publicPath.slice(1)));
			pending.catch(() => statics.delete(publicPath));
			statics.set(publicPath, pending);
		}
		return pending;
	};

	const readStorage = async (key: string): Promise<Buffer> => {
		const cached = cache.get(key);
		if (cached) return cached;
		if (!storageBucket) throw new Error("STORAGE_BUCKET_NAME no configurado");

		const bytes = await storageProvider.getFile(
			bucketForKey(key, {
				defaultBucket: storageBucket,
				publicBucket: storagePublicBucket,
			}),
			key,
		);
		cache.set(key, bytes);
		return bytes;
	};

	/**
	 * Una imagen del curso. El diseño ya pasó por `isOwnCertificateAssetRef`
	 * al guardarse, pero de aquí no sale un objeto de otra carpeta aunque
	 * alguien edite la fila a mano.
	 */
	const loadImage = async (ref: string): Promise<[string, string]> => {
		const key = getKeyFromUrl(ref);
		if (!key || !courseOfCertificateAssetKey(key)) {
			throw new CertificateExportFailedError("image reference is invalid");
		}
		try {
			return [ref, dataUri(contentTypeForKey(key), await readStorage(key))];
		} catch {
			throw new CertificateExportFailedError("image is unreadable");
		}
	};

	const loadLogo = async (
		logoId: string,
		source: LogoSource | undefined,
	): Promise<[string, string]> => {
		if (!source) throw new CertificateExportFailedError("logo is unknown");
		try {
			if (source.kind === "builtin") {
				return [
					logoId,
					dataUri(
						contentTypeForKey(source.path),
						await readStatic(source.path),
					),
				];
			}
			if (!source.key.startsWith(`${INSTITUTIONAL_LOGO.prefix}/`)) {
				throw new Error("logo key outside its folder");
			}
			return [
				logoId,
				dataUri(contentTypeForKey(source.key), await readStorage(source.key)),
			];
		} catch {
			throw new CertificateExportFailedError("logo is unreadable");
		}
	};

	const loadFace = async (faceKey: string): Promise<[string, string]> => {
		const face = ALL_FACES.get(faceKey);
		if (!face) throw new CertificateExportFailedError("font face is unknown");
		return [faceKey, dataUri("font/woff2", await readStatic(face.file))];
	};

	const loadLegacy = async () => {
		const fonts = Object.fromEntries(
			await Promise.all(
				CERTIFICATE_FONT_FILES.map(async ([file]) => [
					file,
					dataUri(
						"font/woff2",
						await readStatic(
							`${CERTIFICATE_FONT_DIR}/ITCAvantGardeStd-${file}.woff2`,
						),
					),
				]),
			),
		) as Record<CertificateFontFile, string>;
		return {
			fonts,
			logo: dataUri("image/png", await readStatic(CERTIFICATE_LOGO_PATH)),
		};
	};

	return {
		async load(manifest, logos) {
			const [legacy, faces, logoEntries, images] = await Promise.all([
				manifest.legacy ? loadLegacy() : null,
				Promise.all(manifest.faces.map(loadFace)),
				Promise.all(manifest.logoIds.map((id) => loadLogo(id, logos[id]))),
				Promise.all(manifest.imageRefs.map(loadImage)),
			]);

			const assets: CertificateAssets = {
				...legacy,
				faces: Object.fromEntries(faces),
				logos: Object.fromEntries(logoEntries),
				images: Object.fromEntries(images),
			};
			return assets;
		},

		async loadBackgroundPdf(ref) {
			const key = getKeyFromUrl(ref);
			if (!key || !courseOfCertificateAssetKey(key)) {
				throw new CertificateExportFailedError(
					"background reference is invalid",
				);
			}
			try {
				return new Uint8Array(await readStorage(key));
			} catch {
				throw new CertificateExportFailedError("background is unreadable");
			}
		},
	};
};
