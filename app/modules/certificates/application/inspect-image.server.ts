import { imageSize } from "image-size";
import {
	type CertificateImageType,
	sniffImageType,
	svgRejectionOf,
} from "../domain/certificate-assets.rules";

export interface InspectedImage {
	type: CertificateImageType;
	widthPx: number;
	heightPx: number;
}

export interface ImageLimits {
	types: readonly CertificateImageType[];
	maxBytes: number;
	maxSvgBytes: number;
}

const MB = 1024 * 1024;

/**
 * El tipo real y las medidas de una imagen subida, o el motivo para
 * rechazarla, en español: lo interpola el mensaje del error.
 */
export const inspectImage = (
	bytes: Uint8Array,
	limits: ImageLimits,
): InspectedImage | { rejection: string } => {
	if (bytes.byteLength === 0) return { rejection: "el archivo está vacío" };
	if (bytes.byteLength > limits.maxBytes) {
		return { rejection: `pesa más de ${limits.maxBytes / MB} MB` };
	}

	const type = sniffImageType(bytes);
	if (!type || !limits.types.includes(type)) {
		return { rejection: "no es una imagen de un formato admitido" };
	}

	if (type === "svg") {
		if (bytes.byteLength > limits.maxSvgBytes) {
			return {
				rejection: `el SVG pesa más de ${limits.maxSvgBytes / 1024} KB`,
			};
		}
		const reason = svgRejectionOf(new TextDecoder().decode(bytes));
		if (reason) return { rejection: `el SVG ${reason}` };
	}

	try {
		const { width, height } = imageSize(bytes);
		if (!width || !height) return { rejection: "no tiene medidas" };
		return { type, widthPx: width, heightPx: height };
	} catch {
		return { rejection: "no se pudo leer" };
	}
};
