// Recorrido completo de un prefijo, página a página, con tope.
//
// Construido sobre `listObjects` del puerto, así que funciona igual en S3 y GCS.
// Lo usan las operaciones que actúan sobre una carpeta entera —borrarla,
// descargarla como ZIP, buscar huérfanos— y que por eso necesitan TODAS sus keys
// y no una página.

import type { IStorageProvider, StorageObject } from "./storage.port";

export interface CollectObjectsResult {
	objects: StorageObject[];
	/**
	 * `true` si el prefijo tenía más objetos que `maxObjects`. Quien llama decide
	 * si eso es un error (borrar a medias una carpeta) o un aviso (un escaneo).
	 */
	truncated: boolean;
}

/**
 * Enumera los objetos de `prefix` —incluidas sus subcarpetas— hasta `maxObjects`.
 *
 * El tope existe porque el resultado se guarda en memoria: sin él, pedir la
 * carpeta raíz de un bucket grande cargaría el inventario entero de objetos.
 */
export const collectObjects = async (
	provider: IStorageProvider,
	bucketName: string,
	prefix: string,
	{ maxObjects }: { maxObjects: number },
): Promise<CollectObjectsResult> => {
	const objects: StorageObject[] = [];
	let cursor: string | null = null;

	do {
		const page = await provider.listObjects(bucketName, {
			prefix,
			cursor,
			// Se pide uno de más para distinguir "exactamente el tope" de "más que
			// el tope" sin una petición extra.
			limit: Math.min(1000, maxObjects - objects.length + 1),
		});

		objects.push(...page.objects);
		cursor = page.nextCursor;

		if (objects.length > maxObjects) {
			return { objects: objects.slice(0, maxObjects), truncated: true };
		}
	} while (cursor);

	return { objects, truncated: false };
};
