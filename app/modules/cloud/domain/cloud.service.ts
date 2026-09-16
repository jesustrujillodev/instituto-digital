import type {
	CloudDeleteResponse,
	CloudDownloadResponse,
	CloudListInput,
	CloudListingResponse,
	CloudSelection,
	DeleteImpactResponse,
	OrphanScanResponse,
	ZipManifestResponse,
} from "./cloud.types";

/**
 * Casos de uso del gestor de nube.
 *
 * Todos devuelven el envelope y ninguno lanza para los fallos esperados. Las
 * rutas llegan ya validadas (cloud.rules.ts): el servicio no vuelve a comprobar
 * su forma, solo su contenido.
 */
export interface ICloudService {
	/**
	 * Un nivel de carpeta, con los dos buckets fusionados en un único árbol.
	 * Falla con `CLOUD_NOT_CONFIGURED` si no hay storage.
	 */
	list(input: CloudListInput): Promise<CloudListingResponse>;

	/** URL firmada de corta vida que fuerza la descarga. */
	downloadUrl(key: string): Promise<CloudDownloadResponse>;

	/**
	 * Lista de URLs firmadas para que el NAVEGADOR arme el ZIP: los bytes van
	 * del bucket al navegador sin pasar por el servidor.
	 */
	zipManifest(selection: CloudSelection): Promise<ZipManifestResponse>;

	/** Qué se borraría y a quién afecta, sin borrar nada. */
	previewDelete(selection: CloudSelection): Promise<DeleteImpactResponse>;

	/**
	 * Borra la selección en cascada: primero suelta las referencias en la base,
	 * después borra los objetos.
	 */
	delete(
		selection: CloudSelection,
		actor: { userId: number | null },
	): Promise<CloudDeleteResponse>;

	/** Objetos sin referencia y fuera de la ventana de gracia. */
	scanOrphans(prefix: string): Promise<OrphanScanResponse>;
}
