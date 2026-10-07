import type * as v from "valibot";

/** Una lectura cacheable y de qué alcances depende. */
export interface CachedRead<T> {
	/** Nombre de la lectura; junto con `key` identifica el valor. */
	name: string;
	key: string;
	/** Invalidar cualquiera de estos alcances deja el valor viejo. */
	dependsOn: readonly string[];
	ttlS: number;
	/** Valida lo leído de la caché y reconstruye `T` desde su forma en JSON. */
	schema: v.GenericSchema<unknown, T>;
}

/**
 * Caché de agregados caros con invalidación por versión (docs/redis/00-redis.md).
 *
 * Invalidar cambia la versión del alcance en vez de borrar valores: una lectura
 * que estaba calculando con la versión anterior escribe un valor que nadie
 * volverá a aceptar, así que no hay carrera entre invalidar y recalcular.
 */
export interface VersionedCache {
	getOrCompute<T>(read: CachedRead<T>, compute: () => Promise<T>): Promise<T>;
	/** Nunca lanza: si falla, el TTL acota cuánto puede durar el valor viejo. */
	invalidate(scope: string): Promise<void>;
}
