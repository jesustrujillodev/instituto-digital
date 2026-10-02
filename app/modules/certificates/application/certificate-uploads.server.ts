import type { ICradle } from "@/shared/di/container.types";
import { contentTypeForKey } from "@/shared/storage/mime";
import { buildObjectKey } from "@/shared/storage/object-key";
import { toProxyRef } from "@/shared/storage/public-url";
import { bucketForKey } from "@/shared/storage/storage.policy";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import type { UploadInput } from "@/shared/storage/upload-validation";
import {
	CertificateAssetInvalidError,
	CertificateBackgroundInvalidError,
} from "../domain/certificate.errors";
import type {
	UploadedBackground,
	UploadedImage,
} from "../domain/certificate.types";
import {
	assetFileNameOf,
	CERTIFICATE_ASSETS,
	rasterMatches,
} from "../domain/certificate-assets.rules";
import { inspectImage } from "./inspect-image.server";

// ===============================================================
// Subidas de imágenes y fondos del certificado
// ===============================================================
// Las comparten el certificado de un curso y las plantillas de la biblioteca;
// solo cambia la carpeta. Reciben sus dependencias explícitas: no guardan
// estado ni se inyectan.

export type UploadDeps = Pick<
	ICradle,
	"storageProvider" | "storageBucket" | "storagePublicBucket"
>;

const bucketOf = (deps: UploadDeps, key: string) => {
	// Error de configuración, no de negocio: sale como UNEXPECTED.
	if (!deps.storageBucket)
		throw new Error("STORAGE_BUCKET_NAME no configurado");
	return bucketForKey(key, {
		defaultBucket: deps.storageBucket,
		publicBucket: deps.storagePublicBucket,
	});
};

/** Guarda bytes en una key y devuelve su referencia del proxy. */
export const storeBytes = async (
	deps: UploadDeps,
	key: string,
	bytes: Uint8Array,
): Promise<string> => {
	await deps.storageProvider.uploadFile(
		bucketOf(deps, key),
		key,
		bytes,
		contentTypeForKey(key),
	);
	return toProxyRef(key);
};

/**
 * Copia un objeto de una carpeta a otra y devuelve la referencia de la copia.
 * Leer y volver a escribir sirve igual con S3 y con GCS; los archivos son de
 * unos pocos MB.
 */
export const copyObject = async (
	deps: UploadDeps,
	ref: string,
	folder: string,
): Promise<string> => {
	const key = getKeyFromUrl(ref);
	if (!key) throw new Error(`referencia de storage ilegible: ${ref}`);
	const bytes = await deps.storageProvider.getFile(bucketOf(deps, key), key);
	const name = key
		.slice(key.lastIndexOf("/") + 1)
		.replace(/-\d+(\.[^.]+)$/, "$1");
	return storeBytes(deps, buildObjectKey(folder, name), bytes);
};

/** Una imagen o firma: se reconoce por sus bytes y se guarda con su tipo real. */
export const storeCertificateImage = async (
	deps: UploadDeps,
	folder: string,
	file: UploadInput,
): Promise<UploadedImage> => {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const inspected = inspectImage(bytes, CERTIFICATE_ASSETS.image);
	if ("rejection" in inspected) {
		throw new CertificateAssetInvalidError(inspected.rejection);
	}

	const ref = await storeBytes(
		deps,
		buildObjectKey(folder, assetFileNameOf(file.name, inspected.type)),
		bytes,
	);
	return { ref, widthPx: inspected.widthPx, heightPx: inspected.heightPx };
};

export interface BackgroundInput {
	pdf: UploadInput;
	raster: UploadInput;
	rasterDpi: number;
}

/**
 * Un PDF de fondo: se guarda reconstruido, nunca el original. El raster lo
 * produce el navegador con pdf.js; aquí solo se comprueba que corresponde a la
 * página y a la resolución declarada.
 */
export const storeCertificateBackground = async (
	deps: UploadDeps & Pick<ICradle, "certificatePdfTools">,
	folder: string,
	{ pdf, raster, rasterDpi }: BackgroundInput,
): Promise<UploadedBackground> => {
	const { maxPdfBytes, maxRasterBytes } = CERTIFICATE_ASSETS.background;
	if (pdf.size > maxPdfBytes) {
		throw new CertificateBackgroundInvalidError("too_large");
	}
	const sanitized = await deps.certificatePdfTools.sanitize(
		new Uint8Array(await pdf.arrayBuffer()),
	);

	const rasterBytes = new Uint8Array(await raster.arrayBuffer());
	const inspected = inspectImage(rasterBytes, {
		types: ["webp", "jpeg", "png"],
		maxBytes: maxRasterBytes,
		maxSvgBytes: 0,
	});
	if (
		"rejection" in inspected ||
		!rasterMatches(inspected, sanitized, rasterDpi)
	) {
		throw new CertificateBackgroundInvalidError("raster_mismatch");
	}

	const [pdfRef, rasterRef] = await Promise.all([
		storeBytes(deps, buildObjectKey(folder, "fondo.pdf"), sanitized.bytes),
		storeBytes(
			deps,
			buildObjectKey(folder, assetFileNameOf("fondo", inspected.type)),
			rasterBytes,
		),
	]);
	return {
		pdfRef,
		rasterRef,
		rasterDpi,
		widthPt: sanitized.widthPt,
		heightPt: sanitized.heightPt,
	};
};
