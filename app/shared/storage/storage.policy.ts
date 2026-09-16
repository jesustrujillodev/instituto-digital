// Política por prefijo — único punto de verdad sobre TRES decisiones que dependen
// de la key y de nada más: si el objeto es público, en qué bucket vive y con qué
// `Cache-Control` se sube. Las tres derivan del mismo criterio (el prefijo
// lógico) porque son la misma decisión vista desde tres capas distintas.
//
// Al usarse la misma función para escribir y para leer, no puede haber
// desacuerdo entre ambos lados: la key ES la dirección del objeto.

// Prefijos cuyo contenido es de acceso público (servible sin sesión por el
// proxy). Todo lo que NO empiece por uno de estos es privado por defecto
// (fail-closed). Mantener alineado con las convenciones de key de los
// consumidores (ver object-key.ts).
export const PUBLIC_PREFIXES = ["profile-photos/", "media/"] as const;

// Prefijos que además se sirven desde el bucket público / CDN.
//
// Es un SUBCONJUNTO de PUBLIC_PREFIXES por definición: un objeto servido por un
// dominio abierto no puede exigir sesión. El invariante está testeado.
//
// `profile-photos/` queda deliberadamente fuera: son pocas, las ve solo el panel
// y son dato de personal — se sirven por el proxy como siempre.
export const CDN_PREFIXES = ["media/"] as const;

const hasPrefix = (key: string, prefixes: readonly string[]): boolean =>
	prefixes.some((prefix) => key.startsWith(prefix));

/** `true` si la key corresponde a un objeto de acceso público. */
export const isPublicKey = (key: string): boolean =>
	hasPrefix(key, PUBLIC_PREFIXES);

/** `true` si la key vive en el bucket público y se sirve por CDN. */
export const isCdnKey = (key: string): boolean => hasPrefix(key, CDN_PREFIXES);

export interface BucketPair {
	/** Bucket por defecto (STORAGE_BUCKET_NAME). Aloja todo lo no-CDN. */
	defaultBucket: string;
	/** Bucket público (STORAGE_PUBLIC_BUCKET_NAME). Ausente = modo un bucket. */
	publicBucket?: string | null;
}

/**
 * Bucket donde vive una key.
 *
 * Sin `publicBucket` devuelve siempre el de por defecto: es el modo de un solo
 * bucket, que es el comportamiento por defecto del proyecto y el que corre en
 * local con MinIO.
 *
 * AVISO: no es retroactivo. Los objetos ya subidos se quedan donde aterrizaron,
 * así que mover un prefijo entre CDN_PREFIXES y el resto exige copiar los
 * objetos a mano — no basta con editar la constante.
 */
export const bucketForKey = (
	key: string,
	{ defaultBucket, publicBucket }: BucketPair,
): string => (publicBucket && isCdnKey(key) ? publicBucket : defaultBucket);

/**
 * `Cache-Control` con el que se sube un objeto.
 *
 * Los objetos del CDN son inmutables —`buildObjectKey` le añade un timestamp a
 * cada key, así que una key nunca cambia de contenido— y por eso pueden cachearse
 * un año. Sin esta cabecera el CDN cachearía mal y el cambio no serviría de nada.
 */
export const CDN_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const PRIVATE_CACHE_CONTROL = "private, no-store";

export const cacheControlForKey = (key: string): string =>
	isCdnKey(key) ? CDN_CACHE_CONTROL : PRIVATE_CACHE_CONTROL;
