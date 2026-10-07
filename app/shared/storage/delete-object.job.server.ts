import type { IStorageProvider } from "./storage.port";

/**
 * Trabajo `delete-object`. Un objeto que ya no está cuenta como borrado: el
 * reintento de un borrado que sí ocurrió no debe agotar intentos (GCS responde
 * 404 donde S3 no dice nada).
 */
export const createDeleteObjectJob =
	(storageProvider: IStorageProvider) =>
	async ({ bucket, key }: { bucket: string; key: string }): Promise<void> => {
		try {
			await storageProvider.deleteFile(bucket, key);
		} catch (error) {
			if (await storageProvider.fileExists(bucket, key)) throw error;
		}
	};
