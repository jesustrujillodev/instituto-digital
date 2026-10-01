/** Menos de esto no se lee como una lista que viene en camino. */
const MIN_PLACEHOLDERS = 3;

/**
 * Cuántas siluetas pinta una lista mientras se recarga: las que ya tenía, para
 * que no cambie de alto, sin pasar de lo que cabe en una página.
 */
export const placeholderCountOf = (
	currentCount: number,
	pageSize: number,
): number =>
	Math.min(Math.max(currentCount, MIN_PLACEHOLDERS), Math.max(pageSize, 1));
