import {
	CreateBucketCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
	type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Logger } from "@/shared/logging/logger";
import { cacheControlForKey } from "./storage.policy";
import type {
	DeleteFilesResult,
	IStorageProvider,
	StorageConfig,
	StorageObject,
	UploadUrlOptions,
} from "./storage.port";

// Sanea un nombre para incrustarlo en un header Content-Disposition sin permitir
// inyección de headers (comillas, saltos de línea, retornos de carro).
const safeHeaderFilename = (key: string): string =>
	(key.split("/").pop() || "download").replace(/["\r\n]/g, "_");

// Topes por petición fijados por la API de S3 (DeleteObjects y ListObjectsV2).
const DELETE_BATCH_SIZE = 1000;
const MAX_LIST_KEYS = 1000;

export const createS3StorageProvider = (
	config: StorageConfig,
	logger: Logger,
): IStorageProvider => {
	const clientConfig: S3ClientConfig = {
		region: config.region,
		// `true` es necesario para MinIO/endpoints custom. En AWS real debe ir
		// `false` (path-style está deprecado) — se controla vía STORAGE_FORCE_PATH_STYLE.
		forcePathStyle: config.forcePathStyle ?? true,
		credentials: {
			accessKeyId: config.accessKeyId || "",
			secretAccessKey: config.secretAccessKey || "",
		},
	};

	if (config.endpoint) {
		clientConfig.endpoint = config.endpoint;
	}

	const client = new S3Client(clientConfig);

	return {
		async createBucket(bucketName: string): Promise<void> {
			try {
				await client.send(new CreateBucketCommand({ Bucket: bucketName }));
				logger.info("[S3] bucket creado", { bucket: bucketName });
			} catch (error: unknown) {
				const err = error as { name?: string; Code?: string };
				if (
					err.name !== "BucketAlreadyOwnedByYou" &&
					err.Code !== "BucketAlreadyExists"
				) {
					logger.error("[S3] fallo al crear bucket", {
						bucket: bucketName,
						error: String(error),
					});
					throw error;
				}
				logger.info("[S3] bucket ya existe", { bucket: bucketName });
			}
		},

		async uploadFile(
			bucketName: string,
			key: string,
			body: Buffer | string | Uint8Array,
			contentType?: string,
		): Promise<void> {
			try {
				await client.send(
					new PutObjectCommand({
						Bucket: bucketName,
						Key: key,
						Body: body,
						ContentType: contentType,
						// Inmutable para lo que sirve el CDN (la key lleva timestamp, nunca
						// cambia de contenido); sin caché para lo privado. Ver storage.policy.
						CacheControl: cacheControlForKey(key),
					}),
				);
				logger.info("[S3] archivo subido", { bucket: bucketName, key });
			} catch (error) {
				logger.error("[S3] fallo al subir archivo", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},

		async getFile(bucketName: string, key: string): Promise<Buffer> {
			try {
				const response = await client.send(
					new GetObjectCommand({ Bucket: bucketName, Key: key }),
				);

				if (!response.Body) {
					throw new Error(`File not found: ${key}`);
				}

				const chunks: Uint8Array[] = [];
				for await (const chunk of response.Body as any) {
					chunks.push(chunk);
				}

				return Buffer.concat(chunks);
			} catch (error) {
				logger.error("[S3] fallo al leer archivo", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},

		async listFiles(bucketName: string, prefix?: string): Promise<string[]> {
			try {
				const response = await client.send(
					new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix }),
				);

				return response.Contents?.map((item) => item.Key || "") || [];
			} catch (error) {
				logger.error("[S3] fallo al listar archivos", {
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
				const response = await client.send(
					new ListObjectsV2Command({
						Bucket: bucketName,
						Prefix: prefix || undefined,
						Delimiter: delimiter,
						ContinuationToken: cursor || undefined,
						MaxKeys: Math.min(limit ?? MAX_LIST_KEYS, MAX_LIST_KEYS),
					}),
				);

				return {
					folders: (response.CommonPrefixes ?? [])
						.map((entry) => entry.Prefix ?? "")
						.filter((folder) => folder !== ""),
					objects: (response.Contents ?? [])
						// Algunas herramientas crean "carpetas" como objetos vacíos cuya
						// key acaba en `/`. No son archivos: no se listan como tales.
						.filter((item) => item.Key && !item.Key.endsWith("/"))
						.map((item) => ({
							key: item.Key as string,
							size: item.Size ?? 0,
							lastModified: item.LastModified ?? null,
						})),
					nextCursor: response.IsTruncated
						? (response.NextContinuationToken ?? null)
						: null,
				};
			} catch (error) {
				logger.error("[S3] fallo al listar objetos", {
					bucket: bucketName,
					prefix,
					error: String(error),
				});
				throw error;
			}
		},

		async deleteFiles(bucketName, keys) {
			const result: DeleteFilesResult = { deleted: [], failed: [] };

			for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
				const batch = keys.slice(start, start + DELETE_BATCH_SIZE);
				try {
					const response = await client.send(
						new DeleteObjectsCommand({
							Bucket: bucketName,
							Delete: {
								Objects: batch.map((key) => ({ Key: key })),
								// Sin Quiet la respuesta enumera también los borrados, que
								// es lo que permite devolver `deleted` sin suponerlo.
								Quiet: false,
							},
						}),
					);

					const failedKeys = new Set<string>();
					for (const entry of response.Errors ?? []) {
						if (!entry.Key) continue;
						failedKeys.add(entry.Key);
						result.failed.push({
							key: entry.Key,
							error: entry.Message ?? entry.Code ?? "error desconocido",
						});
					}
					// Algunos compatibles (R2, MinIO antiguos) no devuelven `Deleted`:
					// lo que no falló se da por borrado, que en S3 es idempotente.
					result.deleted.push(...batch.filter((key) => !failedKeys.has(key)));
				} catch (error) {
					// Un fallo de la petición entera (red, permisos) marca todo el lote.
					result.failed.push(
						...batch.map((key) => ({ key, error: String(error) })),
					);
				}
			}

			if (result.failed.length > 0) {
				logger.warn("[S3] borrado en lote incompleto", {
					bucket: bucketName,
					deleted: result.deleted.length,
					failed: result.failed.length,
				});
			} else {
				logger.info("[S3] archivos borrados en lote", {
					bucket: bucketName,
					count: result.deleted.length,
				});
			}

			return result;
		},

		async deleteFile(bucketName: string, key: string): Promise<void> {
			try {
				await client.send(
					new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
				);
				logger.info("[S3] archivo borrado", { bucket: bucketName, key });
			} catch (error) {
				logger.error("[S3] fallo al borrar archivo", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},

		async fileExists(bucketName: string, key: string): Promise<boolean> {
			try {
				await client.send(
					new HeadObjectCommand({ Bucket: bucketName, Key: key }),
				);
				return true;
			} catch (error: unknown) {
				const err = error as {
					name?: string;
					$metadata?: { httpStatusCode?: number };
				};
				if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
					return false;
				}
				logger.error("[S3] fallo al comprobar existencia", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
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
				const filename = safeHeaderFilename(key);
				const disposition = options.disposition ?? "inline";
				const command = new GetObjectCommand({
					Bucket: bucketName,
					Key: key,
					ResponseContentDisposition: `${disposition}; filename="${filename}"`,
				});
				return await getSignedUrl(client as any, command as any, {
					expiresIn: expiresInSeconds,
				});
			} catch (error) {
				logger.error("[S3] fallo al generar presigned URL", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},

		async getUploadUrl(
			bucketName: string,
			key: string,
			options: UploadUrlOptions,
		): Promise<string> {
			try {
				// Solo `ContentType`: todo lo que se firma se convierte en cabecera
				// OBLIGATORIA para quien sube, y el navegador manda `Content-Type`
				// pero no `Cache-Control`. Firmarla daría 403 por firma inválida.
				const command = new PutObjectCommand({
					Bucket: bucketName,
					Key: key,
					ContentType: options.contentType,
				});
				return await getSignedUrl(client as any, command as any, {
					expiresIn: options.expiresInSeconds ?? 900,
				});
			} catch (error) {
				logger.error("[S3] fallo al generar URL de subida", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},

		async statObject(
			bucketName: string,
			key: string,
		): Promise<StorageObject | null> {
			try {
				const head = await client.send(
					new HeadObjectCommand({ Bucket: bucketName, Key: key }),
				);
				return {
					key,
					size: head.ContentLength ?? 0,
					lastModified: head.LastModified ?? null,
				};
			} catch (error: unknown) {
				const err = error as {
					name?: string;
					$metadata?: { httpStatusCode?: number };
				};
				if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
					return null;
				}
				logger.error("[S3] fallo al leer metadatos", {
					bucket: bucketName,
					key,
					error: String(error),
				});
				throw error;
			}
		},
	};
};
