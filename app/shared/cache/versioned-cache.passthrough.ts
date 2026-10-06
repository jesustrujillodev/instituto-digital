import type { VersionedCache } from "./versioned-cache";

/**
 * Sin Redis no se cachea: una copia por proceso no se enteraría de lo que
 * invalida otro nodo y serviría datos viejos durante todo el TTL.
 */
export const createPassthroughVersionedCache = (): VersionedCache => ({
	getOrCompute: (_read, compute) => compute(),
	invalidate: async () => {},
});
