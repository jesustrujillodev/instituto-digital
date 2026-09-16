export interface StorageConfig {
	// S3 Specific
	region?: string;
	endpoint?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	forcePathStyle?: boolean;

	// GCS Specific
	credentialsPath?: string;
	credentialsBase64?: string;
	useEmulator?: boolean;
	emulatorHost?: string;
	provider?: "s3" | "gcs";
	defaultBucket?: string;
}

/** Objeto listado con sus metadatos, tal como los reporta el proveedor. */
export interface StorageObject {
	key: string;
	size: number;
	lastModified: Date | null;
}

export interface ListObjectsOptions {
	/**
	 * Prefijo CRUDO: se envía tal cual en los dos proveedores. Para listar el
	 * contenido de una carpeta, acabarlo en `/` (`media/` y no `catalog`).
	 */
	prefix?: string;
	/**
	 * Con `"/"` el listado es de UN nivel: lo que hay debajo de una subcarpeta se
	 * resume en `folders` en vez de enumerarse. Sin él, se recorre todo el prefijo.
	 */
	delimiter?: "/";
	/** Token opaco devuelto como `nextCursor` por la página anterior. */
	cursor?: string | null;
	/** Máximo de entradas por página. Los proveedores lo topan en 1000. */
	limit?: number;
}

export interface ListObjectsResult {
	/** Prefijos completos de las subcarpetas, acabados en `/`. */
	folders: string[];
	objects: StorageObject[];
	/** `null` cuando no hay más páginas. Solo avanza: no hay "página anterior". */
	nextCursor: string | null;
}

export interface DeleteFilesResult {
	deleted: string[];
	failed: { key: string; error: string }[];
}

export interface PresignedUrlOptions {
	/**
	 * `inline` (por defecto) deja que el navegador lo muestre; `attachment` fuerza
	 * la descarga con el nombre del archivo.
	 */
	disposition?: "inline" | "attachment";
}

export interface IStorageProvider {
	createBucket(bucketName: string): Promise<void>;
	uploadFile(
		bucketName: string,
		key: string,
		body: Buffer | string | Uint8Array,
		contentType?: string,
	): Promise<void>;
	getFile(bucketName: string, key: string): Promise<Buffer>;
	listFiles(bucketName: string, prefix?: string): Promise<string[]>;
	/**
	 * Listado paginado con metadatos y, opcionalmente, agrupado por carpetas.
	 * A diferencia de `listFiles`, el prefijo se respeta tal cual en S3 y en GCS.
	 */
	listObjects(
		bucketName: string,
		options?: ListObjectsOptions,
	): Promise<ListObjectsResult>;
	deleteFile(bucketName: string, key: string): Promise<void>;
	/**
	 * Borrado en lote. No lanza por un fallo parcial: cada key que no se pudo
	 * borrar vuelve en `failed`, para que quien llama decida qué hacer con ella.
	 */
	deleteFiles(
		bucketName: string,
		keys: readonly string[],
	): Promise<DeleteFilesResult>;
	fileExists(bucketName: string, key: string): Promise<boolean>;
	getPublicUrl(bucketName: string, key: string): string;
	getPresignedUrl(
		bucketName: string,
		key: string,
		expiresInSeconds?: number,
		options?: PresignedUrlOptions,
	): Promise<string>;
}
