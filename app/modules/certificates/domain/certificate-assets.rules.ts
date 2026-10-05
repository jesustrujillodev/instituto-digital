import { toProxyRef } from "@/shared/storage/public-url";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import { CERTIFICATE_SIGNATURE } from "./certificate.config";

// ===============================================================
// Imágenes y fondos del certificado en storage
// ===============================================================
// Todo vive privado y con el curso en la key, como las firmas de ADR 0018: la
// fuente de referencias sabe de quién es cada objeto sin tabla propia, y un
// diseño solo puede imprimir lo que se subió a SU curso.

export const CERTIFICATE_ASSETS = {
	prefix: "documentos/certificados",
	folders: { image: "imagenes", background: "fondos" },
	image: {
		/** Lo que el servidor reconoce por sus bytes, no por el nombre. */
		types: ["png", "jpeg", "webp", "svg"] as const,
		maxBytes: 2 * 1024 * 1024,
		maxSvgBytes: 512 * 1024,
	},
	background: {
		maxPdfBytes: 10 * 1024 * 1024,
		/** El proxy no sirve en línea objetos más grandes (`MAX_INLINE_BYTES`). */
		maxRasterBytes: 15 * 1024 * 1024,
	},
} as const;

export type CertificateImageType =
	(typeof CERTIFICATE_ASSETS.image.types)[number];
export type CertificateAssetFolder = keyof typeof CERTIFICATE_ASSETS.folders;

export const IMAGE_EXTENSIONS: Record<CertificateImageType, string> = {
	png: ".png",
	jpeg: ".jpg",
	webp: ".webp",
	svg: ".svg",
};

/** Carpeta de un tipo de recurso del curso, sin barra final. */
export const certificateAssetFolderOf = (
	courseDocumentId: string,
	folder: CertificateAssetFolder,
): string =>
	`${CERTIFICATE_ASSETS.prefix}/${courseDocumentId}/${CERTIFICATE_ASSETS.folders[folder]}`;

const FOLDER_NAMES = new Set<string>(Object.values(CERTIFICATE_ASSETS.folders));

/**
 * El curso dueño de una key de recurso del certificado, o null. Acepta el
 * layout de las firmas del gestor anterior (`documentos/firmas/<curso>/x`) y
 * el del editor libre (`documentos/certificados/<curso>/<carpeta>/x`).
 */
export const courseOfCertificateAssetKey = (key: string): string | null => {
	if (key.includes("..")) return null;

	const legacy = `${CERTIFICATE_SIGNATURE.prefix}/`;
	if (key.startsWith(legacy)) {
		const [course, file, ...rest] = key.slice(legacy.length).split("/");
		return course && file && rest.length === 0 ? course : null;
	}

	const current = `${CERTIFICATE_ASSETS.prefix}/`;
	if (key.startsWith(current)) {
		const [course, folder, file, ...rest] = key
			.slice(current.length)
			.split("/");
		return course && FOLDER_NAMES.has(folder) && file && rest.length === 0
			? course
			: null;
	}
	return null;
};

/**
 * Lo único que un diseño puede guardar como imagen o fondo: la referencia del
 * proxy de una key de ESTE curso. Deja fuera `blob:`/`data:`, URLs externas y
 * recursos de otro curso: con estos, quien administra un curso imprimiría la
 * firma de un titular ajeno.
 */
export const isOwnCertificateAssetRef = (
	ref: string,
	courseDocumentId: string,
): boolean => {
	if (!ref.startsWith("/api/storage?")) return false;
	const key = getKeyFromUrl(ref);
	return (
		key !== null &&
		courseOfCertificateAssetKey(key) === courseDocumentId &&
		toProxyRef(key) === ref
	);
};

// ── Lo que hay en los bytes ───────────────────────────────────────────────────

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
	signature.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const SVG_HEAD =
	/^(?:﻿)?\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i;

/**
 * El tipo real de una imagen por su firma de bytes. El navegador declara el
 * tipo que quiera, y el proxy decide el `Content-Type` por la extensión de la
 * key: por eso la extensión sale de aquí y nunca del nombre del archivo.
 */
export const sniffImageType = (
	bytes: Uint8Array,
): CertificateImageType | null => {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
		return "png";
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
	if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8))
		return "webp";

	const head = new TextDecoder("utf-8", { fatal: false }).decode(
		bytes.subarray(0, 1024),
	);
	return SVG_HEAD.test(head) ? "svg" : null;
};

/** `%PDF-` en los primeros bytes, como lo exige el estándar. */
export const looksLikePdf = (bytes: Uint8Array): boolean =>
	startsWith(bytes, ascii("%PDF-"));

const SVG_FORBIDDEN: readonly [RegExp, string][] = [
	[/<script[\s>/]/i, "contiene scripts"],
	[/\son[a-z]+\s*=/i, "contiene manejadores de eventos"],
	[/javascript:/i, "contiene enlaces a JavaScript"],
	[/<foreignObject[\s>/]/i, "incrusta HTML"],
	[/<!DOCTYPE|<!ENTITY/i, "declara entidades"],
	[/@import/i, "importa estilos externos"],
	[/\b(?:xlink:)?href\s*=\s*["']\s*(?!#)/i, "enlaza recursos externos"],
	[/url\(\s*["']?\s*(?!#)/i, "carga recursos externos"],
];

/**
 * Por qué un SVG no se acepta, o null si se acepta. Una lista de rechazo
 * estricta y no un saneador: el SVG solo se pinta por `<img>` (sin scripts), y
 * esto cierra lo que quedaría si alguien lo abriera directo en el navegador.
 */
export const svgRejectionOf = (svg: string): string | null => {
	for (const [pattern, reason] of SVG_FORBIDDEN) {
		if (pattern.test(svg)) return reason;
	}
	return null;
};

/**
 * El nombre con el que se guarda una imagen: el del archivo sin su extensión,
 * más la extensión del tipo REAL. `buildContentObjectKey` lo sanea y le añade
 * la huella de los bytes.
 */
export const assetFileNameOf = (
	originalName: string,
	type: CertificateImageType,
): string => {
	const dot = originalName.lastIndexOf(".");
	const base =
		(dot > 0 ? originalName.slice(0, dot) : originalName) || "imagen";
	return `${base}${IMAGE_EXTENSIONS[type]}`;
};

// ── Raster del fondo PDF ──────────────────────────────────────────────────────

/** Lo más que un canvas de iOS rasteriza: unos 16 megapíxeles. */
const MAX_RASTER_PIXELS = 16_000_000;
export const MAX_RASTER_DPI = 300;
/** El navegador redondea cada lado del canvas a un píxel entero. */
export const RASTER_SIZE_TOLERANCE_PX = 2;

/** La resolución del raster de un fondo: 300 ppp, o menos si no cabe. */
export const rasterDpiFor = (widthPt: number, heightPt: number): number => {
	const area = (widthPt / 72) * (heightPt / 72);
	return Math.min(
		MAX_RASTER_DPI,
		Math.floor(Math.sqrt(MAX_RASTER_PIXELS / area)),
	);
};

export const rasterSizeOf = (
	widthPt: number,
	heightPt: number,
	dpi: number,
) => ({
	widthPx: Math.round((widthPt * dpi) / 72),
	heightPx: Math.round((heightPt * dpi) / 72),
});

/** El raster que subió el navegador corresponde a la página y a su resolución. */
export const rasterMatches = (
	raster: { widthPx: number; heightPx: number },
	page: { widthPt: number; heightPt: number },
	dpi: number,
): boolean => {
	if (dpi > rasterDpiFor(page.widthPt, page.heightPt)) return false;
	const expected = rasterSizeOf(page.widthPt, page.heightPt, dpi);
	return (
		Math.abs(raster.widthPx - expected.widthPx) <= RASTER_SIZE_TOLERANCE_PX &&
		Math.abs(raster.heightPx - expected.heightPx) <= RASTER_SIZE_TOLERANCE_PX
	);
};
