import type { IObjectReferenceSource } from "./object-reference.port";
import type { IStorageProvider } from "./storage.port";

/**
 * Trabajo `delete-object`. Un objeto que ya no está cuenta como borrado: el
 * reintento de un borrado que sí ocurrió no debe agotar intentos (GCS responde
 * 404 donde S3 no dice nada).
 *
 * Quien encola soltó SU referencia, no todas: si otra fila sigue usando la key,
 * el objeto se queda. Se comprueba aquí, ya con la escritura confirmada.
 *
 * Solo borra en los buckets de la app (`buckets`): el payload viaja por la cola,
 * y uno alterado no debe poder borrar en cualquier bucket que alcancen las
 * credenciales. Lo ajeno falla y queda en el registro de fallos.
 */
export const createDeleteObjectJob =
	(
		storageProvider: IStorageProvider,
		referenceSources: readonly IObjectReferenceSource[],
		buckets: readonly string[],
	) =>
	async ({ bucket, key }: { bucket: string; key: string }): Promise<void> => {
		if (!buckets.includes(bucket)) {
			throw new Error(`delete-object: bucket no configurado (${bucket})`);
		}

		const references = await Promise.all(
			referenceSources.map((source) => source.findByKeys([key])),
		);
		if (references.some((found) => found.length > 0)) return;

		try {
			await storageProvider.deleteFile(bucket, key);
		} catch (error) {
			if (await storageProvider.fileExists(bucket, key)) throw error;
		}
	};
