/**
 * Aritmética del reescalado de la portada.
 *
 * Vive aparte del componente porque el componente solo puede correr en el
 * navegador —necesita `canvas`— y esto es lo único del reescalado que tiene
 * casos límite que conviene fijar con una prueba.
 */

export interface CoverCrop {
	/** Recorte centrado sobre la imagen original. */
	sourceX: number;
	sourceY: number;
	sourceWidth: number;
	sourceHeight: number;
	/** Lienzo de salida, ya en la proporción pedida. */
	width: number;
	height: number;
}

/**
 * Recorte centrado a `ratio` y escalado hasta `targetWidth`.
 *
 * Nunca amplía: una imagen más angosta que el objetivo se sube a su tamaño real
 * en vez de interpolarse hasta una nitidez que no tiene.
 */
export const computeCoverCrop = (
	naturalWidth: number,
	naturalHeight: number,
	ratio: number,
	targetWidth: number,
): CoverCrop => {
	const tooWide = naturalWidth / naturalHeight > ratio;

	const sourceWidth = tooWide ? naturalHeight * ratio : naturalWidth;
	const sourceHeight = tooWide ? naturalHeight : naturalWidth / ratio;

	const width = Math.round(Math.min(targetWidth, sourceWidth));

	return {
		sourceX: (naturalWidth - sourceWidth) / 2,
		sourceY: (naturalHeight - sourceHeight) / 2,
		sourceWidth,
		sourceHeight,
		width,
		height: Math.round(width / ratio),
	};
};
