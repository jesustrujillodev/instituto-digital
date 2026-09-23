import { CERTIFICATE_SIGNATURE } from "../domain/certificate.config";

/** El tamaño al que se reduce una firma: nunca se amplía ni se recorta. */
export const signatureSizeOf = (
	width: number,
	height: number,
	targetWidth: number = CERTIFICATE_SIGNATURE.targetWidth,
): { width: number; height: number } => {
	if (width <= targetWidth) return { width, height };

	return {
		width: targetWidth,
		height: Math.max(1, Math.round((height * targetWidth) / width)),
	};
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();

		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("No se pudo leer la imagen"));
		};
		image.src = url;
	});

/**
 * Reduce la firma a un ancho razonable y la deja en PNG.
 *
 * PNG y no WebP con pérdida: una firma es trazo fino sobre transparencia, y la
 * compresión con pérdida la ensucia justo en el borde. Sin recorte, a
 * diferencia de la portada: la firma es la que es.
 *
 * @returns El archivo reducido, o el original si el navegador no pudo.
 */
export const resizeSignatureImage = async (file: File): Promise<File> => {
	try {
		const image = await loadImage(file);
		const size = signatureSizeOf(image.naturalWidth, image.naturalHeight);

		const canvas = document.createElement("canvas");
		canvas.width = size.width;
		canvas.height = size.height;

		const context = canvas.getContext("2d");
		if (!context) return file;
		context.drawImage(image, 0, 0, size.width, size.height);

		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/png");
		});
		if (!blob) return file;

		const name = `${file.name.replace(/\.[^.]+$/, "")}.png`;
		return new File([blob], name, { type: "image/png" });
	} catch {
		// El servidor valida tipo y tamaño de todas formas.
		return file;
	}
};
