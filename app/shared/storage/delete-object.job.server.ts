import type { IObjectReferenceSource } from "./object-reference.port";
import type { IStorageProvider } from "./storage.port";

/**
 * Trabajo `delete-object`. Un objeto que ya no está cuenta como borrado: el
 * reintento de un borrado que sí ocurrió no debe agotar intentos (GCS responde
 * 404 donde S3 no dice nada).
 *
 * Quien encola soltó SU referencia, no todas: si otra fila sigue usando la key,
 * el objeto se queda. Se comprueba aquí, ya con la escritura confirmada.
 */
export const createDeleteObjectJob =
	(
		storageProvider: IStorageProvider,
		referenceSources: readonly IObjectReferenceSource[],
	) =>
	async ({ bucket, key }: { bucket: string; key: string }): Promise<void> => {
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
