import type { UploadInput } from "./upload-validation";

/** Las imágenes raster que la app acepta como foto o portada, con su extensión. */
const RASTER_EXTENSIONS = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
} as const;

export type RasterImageType = keyof typeof RASTER_EXTENSIONS;

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
	signature.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** El tipo de una imagen raster por su firma de bytes, o `null`. */
export const sniffRasterImage = (bytes: Uint8Array): RasterImageType | null => {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return "image/png";
	}
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
		return "image/webp";
	}
	return null;
};

/**
 * La imagen tal como se guarda: el tipo y la extensión salen de los bytes, no
 * del tipo que declaró el navegador ni del nombre. El proxy sirve por la
 * extensión de la key, y foto y portada van en prefijos públicos.
 *
 * `null` si los bytes no son una imagen de `allowedTypes`.
 */
export const asSniffedImage = async (
	file: UploadInput,
	allowedTypes: readonly string[],
): Promise<UploadInput | null> => {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const type = sniffRasterImage(bytes);
	if (!type || !allowedTypes.includes(type)) return null;

	const dot = file.name.lastIndexOf(".");
	const base = dot > 0 ? file.name.slice(0, dot) : file.name;
	return {
		name: `${base}${RASTER_EXTENSIONS[type]}`,
		type,
		size: bytes.byteLength,
		arrayBuffer: async () => bytes.slice().buffer,
	};
};
