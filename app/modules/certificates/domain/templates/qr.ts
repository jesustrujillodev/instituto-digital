import QRCode from "qrcode";

/** Módulos claros alrededor del código: sin ellos los lectores fallan. */
const QUIET_ZONE = 2;

/**
 * El QR como un `<svg>` con un solo `<path>`: sin imágenes, sin scripts y sin
 * nada que pedir por red, así que entra igual a la vista previa y al PDF.
 * `QRCode.create` es síncrono, y el renderizador sigue siendo puro.
 */
export const certificateQrSvg = (url: string, size: number): string => {
	const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
	const side = modules.size + QUIET_ZONE * 2;

	let path = "";
	for (let row = 0; row < modules.size; row++) {
		for (let col = 0; col < modules.size; col++) {
			if (modules.get(row, col)) {
				path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
			}
		}
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${side}" height="${side}" fill="#ffffff"/><path d="${path}" fill="#1f1f1f"/></svg>`;
};
