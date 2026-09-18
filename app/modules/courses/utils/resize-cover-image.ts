import { COURSE_COVER } from "../domain/course.config";
import { computeCoverCrop } from "./cover-crop";

/** Calidad de la recodificación a WebP. Por encima de 0.85 el peso sube sin verse. */
const QUALITY = 0.82;

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
 * Recorta a 16:9, reduce y recodifica a WebP antes de subir.
 *
 * Una cuadrícula de doce tarjetas baja doce portadas: sin esto, doce fotos de
 * teléfono de 4 MB. Se hace en el navegador y no en el servidor porque así no
 * viaja el original por la red y no hace falta una dependencia de imagen.
 *
 * La vista previa se pinta con el archivo que devuelve esta función, no con el
 * original: lo que el organizador aprueba es lo que se guarda.
 *
 * @returns El archivo reescalado, o el original si el navegador no pudo.
 */
export const resizeCoverImage = async (file: File): Promise<File> => {
	try {
		const image = await loadImage(file);
		const crop = computeCoverCrop(
			image.naturalWidth,
			image.naturalHeight,
			COURSE_COVER.aspectRatio,
			COURSE_COVER.targetWidth,
		);

		const canvas = document.createElement("canvas");
		canvas.width = crop.width;
		canvas.height = crop.height;

		const context = canvas.getContext("2d");
		if (!context) return file;

		context.drawImage(
			image,
			crop.sourceX,
			crop.sourceY,
			crop.sourceWidth,
			crop.sourceHeight,
			0,
			0,
			crop.width,
			crop.height,
		);

		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/webp", QUALITY);
		});
		if (!blob) return file;

		const name = `${file.name.replace(/\.[^.]+$/, "")}.webp`;

		return new File([blob], name, { type: "image/webp" });
	} catch {
		// Degradar al original es correcto: el servidor valida tipo y tamaño de
		// todas formas, así que lo peor que pasa es una portada más pesada.
		return file;
	}
};
