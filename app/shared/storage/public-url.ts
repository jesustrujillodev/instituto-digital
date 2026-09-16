// Resolución de la URL con la que se PINTA un objeto público.
//
// Es la contraparte de lectura de `getPublicUrl`: aquel devuelve la referencia
// estable del proxy y es lo que se persiste en BD; este la traduce, al leer, a la
// URL del CDN cuando hay dominio configurado.
//
// La distinción importa: la URL del proveedor NUNCA se hornea en la base de
// datos. Si se guardara, cambiar de dominio o de proveedor exigiría un backfill;
// resolviéndola al pintar, basta con cambiar una variable de entorno.

import { isCdnKey } from "./storage.policy";

/** Referencia estable del proxy. Mismo formato que `getPublicUrl`. */
export const toProxyRef = (key: string): string =>
	`/api/storage?key=${encodeURIComponent(key)}`;

// La key viaja como RUTA, no como query: sus separadores `/` deben sobrevivir,
// pero cada segmento se codifica. `buildObjectKey` ya sanea el nombre a
// [a-zA-Z0-9.-], así que en la práctica no hay nada que escapar — se hace igual
// para que una key de otra procedencia no rompa la URL.
const encodeKeyPath = (key: string): string =>
	key.split("/").map(encodeURIComponent).join("/");

/**
 * Construye el resolutor de URLs de assets.
 *
 * Sin `publicDomain` devuelve la referencia del proxy para todo, que es el
 * comportamiento por defecto del proyecto: un bucket, todo por /api/storage.
 *
 * @param publicDomain Origen público absoluto (p. ej. "https://cdn.dominio.com").
 */
export const createAssetUrlResolver = (
	publicDomain?: string | null,
): ((key: string) => string) => {
	if (!publicDomain) return toProxyRef;

	const origin = publicDomain.replace(/\/+$/, "");

	return (key: string): string =>
		isCdnKey(key) ? `${origin}/${encodeKeyPath(key)}` : toProxyRef(key);
};

/** Tipo del resolutor, para inyectarlo sin repetir la firma. */
export type AssetUrlResolver = ReturnType<typeof createAssetUrlResolver>;
