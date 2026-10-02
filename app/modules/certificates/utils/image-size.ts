/** Lado mayor de una imagen al subirla: de sobra para imprimirla a 300 ppp. */
export const IMAGE_MAX_SIDE_PX = 2400;
/** Una firma es trazo fino: con menos basta. */
export const SIGNATURE_MAX_SIDE_PX = 1200;

/** El tamaño al que se reduce una imagen: nunca se amplía ni se recorta. */
export const fittedSizeOf = (
	width: number,
	height: number,
	maxSide: number,
): { width: number; height: number } => {
	const side = Math.max(width, height);
	if (side <= maxSide) return { width, height };

	const scale = maxSide / side;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
};
