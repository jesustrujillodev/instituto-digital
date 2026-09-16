import { Storage, type StorageOptions } from "@google-cloud/storage";
import type { Logger } from "@/shared/logging/logger";
import { cacheControlForKey } from "./storage.policy";
import type {
	DeleteFilesResult,
	IStorageProvider,
	StorageConfig,
} from "./storage.port";

const MAX_LIST_RESULTS = 1000;

// Mismo saneado que el adaptador S3: el nombre acaba dentro de un header.
const safeHeaderFilename = (key: string): string =>
	(key.split("/").pop() || "download").replace(/["\r\n]/g, "_");

export const createGcsStorageProvider = (
	config: StorageConfig,
	logger: Logger,
): IStorageProvider => {
	let storageConfig: StorageOptions = {};

	const useEmulator = config.useEmulator === true;
	const emulatorHost = config.emulatorHost;

	// Cadena de credenciales: emulador → base64 → keyfile → ADC.
	if (useEmulator && emulatorHost) {
		logger.info("[GCS] usando emulador", { emulatorHost });
		storageConfig = {
			...storageConfig,
			apiEndpoint: emulatorHost,
			credentials: {
				client_email: "test@test.com",
				private_key:
					"-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
			},
		};
	} else if (config.credentialsBase64) {
		try {
			const raw = Buffer.from(config.credentialsBase64, "base64").toString(
				"utf-8",
			);
			const parsed = JSON.parse(raw);
			const privateKeyRaw = parsed.private_key as string;
			const privateKey =
				typeof privateKeyRaw === "string"
					? privateKeyRaw.replace(/\\n/g, "\n")
					: privateKeyRaw;
			storageConfig = {
				...storageConfig,
				projectId: parsed.project_id,
				credentials: {
					client_email: parsed.client_email as string,
					private_key: privateKey,
				},
			};
			logger.info("[GCS] usando credenciales base64");
		} catch (error) {
			logger.error("[GCS] fallo al parsear credentialsBase64", {
				error: String(error),
			});
			throw error;
		}
	} else if (config.credentialsPath) {
		storageConfig.keyFilename = config.credentialsPath;
		logger.info("[GCS] usando keyfile", { path: config.credentialsPath });
	} else {
		logger.info("[GCS] usando Application Default Credentials");
	}

	const storage = new Storage(storageConfig);

	// Solo en modo emulador auto-inicializamos el bucket por defecto para que el
	// entorno local quede listo sin un primer request. En producción la creación
	// de buckets es responsabilidad de la infra/IAM, no de la app.
	if (useEmulator && config.defaultBucket) {
		const bucketName = config.defaultBucket;
		void (async () => {
			try {
				const bucket = storage.bucket(bucketName);
				const [exists] = await bucket.exists();
				if (!exists) {
					await bucket.create();
					logger.info("[GCS] bucket creado en emulador", {
						bucket: bucketName,
					});
				}
			} catch (error) {
				logger.error("[GCS] fallo al inicializar bucket del emulador", {
					bucket: bucketName,
					error: String(error),
				});
			}
		})();
	}

	const provider: IStorageProvider = {
		async createBucket(bucketName: string): Promise<void> {
			try {
				const bucket = storage.bucket(bucketName);
				const [exists] = await bucket.exists();
				if (!exists) {
					await bucket.create();
				}
			} catch (error) {
				logger.error("[GCS] fallo al crear bucket", {
					bucket: bucketName,
					error: String(error),
				});
				throw error;
			}
		},

		async uploadFile(
			bucketName: string,
			key: string,
			body: Buffer | string | Uint8Array,
			contentType?: string,
		): Promise<void> {
			try {
				const fileRef = storage.bucket(bucketName).file(key);
				await fileRef.save(body as Buffer | string, {
					metadata: {
						contentType: contentType || "application/octet-stream",
						// Mismo criterio que el adaptador S3 — ver storage.policy.
						cacheControl: cacheControlForKey(key),
					},
				});
				logger.info("[GCS] archivo subido", { bucket: bucketName, key });
			} catch (error) {
				logger.error("[GCS] fallo al subir archivo", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},

		async getFile(bucketName: string, key: string): Promise<Buffer> {
			try {
				const [buffer] = await storage.bucket(bucketName).file(key).download();
				return buffer;
			} catch (error) {
				logger.error("[GCS] fallo al leer archivo", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},

		async listFiles(bucketName: string, prefix?: string): Promise<string[]> {
			try {
				const options = prefix ? { prefix: `${prefix}/` } : {};
				const [files] = await storage.bucket(bucketName).getFiles(options);
				return files.map((file) => file.name);
			} catch (error) {
				logger.error("[GCS] fallo al listar archivos", {
					bucket: bucketName,
					prefix,
					error: String(error),
				});
				throw error;
			}
		},

		async listObjects(bucketName, options = {}) {
			const { prefix, delimiter, cursor, limit } = options;
			try {
				const [files, nextQuery, apiResponse] = await storage
					.bucket(bucketName)
					.getFiles({
						// Crudo, igual que S3. `listFiles` añade `/` por su cuenta y por eso
						// no se reutiliza aquí.
						prefix: prefix || undefined,
						delimiter,
						pageToken: cursor || undefined,
						maxResults: Math.min(limit ?? MAX_LIST_RESULTS, MAX_LIST_RESULTS),
						autoPaginate: false,
					});
				const prefixes =
					(apiResponse as { prefixes?: string[] } | undefined)?.prefixes ?? [];

				return {
					folders: prefixes,
					objects: files
						.filter((file) => !file.name.endsWith("/"))
						.map((file) => ({
							key: file.name,
							size: Number(file.metadata.size ?? 0),
							lastModified: file.metadata.updated
								? new Date(file.metadata.updated)
								: null,
						})),
					nextCursor:
						(nextQuery as { pageToken?: string } | null)?.pageToken ?? null,
				};
			} catch (error) {
				logger.error("[GCS] fallo al listar objetos", {
					bucket: bucketName,
					prefix,
					error: String(error),
				});
				throw error;
			}
		},

		async deleteFiles(bucketName, keys) {
			// GCS no tiene borrado en lote en la librería: peticiones individuales en
			// paralelo, con el resultado de cada una.
			const bucket = storage.bucket(bucketName);
			const settled = await Promise.allSettled(
				keys.map((key) => bucket.file(key).delete({ ignoreNotFound: true })),
			);

			const result: DeleteFilesResult = { deleted: [], failed: [] };
			settled.forEach((outcome, index) => {
				if (outcome.status === "fulfilled") {
					result.deleted.push(keys[index]);
				} else {
					result.failed.push({
						key: keys[index],
						error: String(outcome.reason),
					});
				}
			});

			if (result.failed.length > 0) {
				logger.warn("[GCS] borrado en lote incompleto", {
					bucket: bucketName,
					deleted: result.deleted.length,
					failed: result.failed.length,
				});
			} else {
				logger.info("[GCS] archivos borrados en lote", {
					bucket: bucketName,
					count: result.deleted.length,
				});
			}

			return result;
		},

		async deleteFile(bucketName: string, key: string): Promise<void> {
			try {
				await storage.bucket(bucketName).file(key).delete();
				logger.info("[GCS] archivo borrado", { bucket: bucketName, key });
			} catch (error) {
				logger.error("[GCS] fallo al borrar archivo", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},

		async fileExists(bucketName: string, key: string): Promise<boolean> {
			try {
				const [exists] = await storage.bucket(bucketName).file(key).exists();
				return exists;
			} catch (error) {
				logger.error("[GCS] fallo al comprobar existencia", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				return false;
			}
		},

		getPublicUrl(_bucketName: string, key: string): string {
			return `/api/storage?key=${encodeURIComponent(key)}`;
		},

		async getPresignedUrl(
			bucketName: string,
			key: string,
			expiresInSeconds = 3600,
			options = {},
		): Promise<string> {
			try {
				if (useEmulator && emulatorHost) {
					// URL de descarga pública compatible con fake-gcs-server.
					return `${emulatorHost}/storage/v1/b/${bucketName}/o/${encodeURIComponent(
						key,
					)}?alt=media`;
				}

				const [url] = await storage
					.bucket(bucketName)
					.file(key)
					.getSignedUrl({
						version: "v4",
						action: "read",
						expires: Date.now() + expiresInSeconds * 1000,
						responseDisposition: `${options.disposition ?? "inline"}; filename="${safeHeaderFilename(key)}"`,
					});

				return url;
			} catch (error) {
				logger.error("[GCS] fallo al generar presigned URL", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},
	};

	return provider;
};
