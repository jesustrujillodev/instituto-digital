import type { Env } from "@/core/env.server";
import type { Logger } from "@/shared/logging/logger";
import { createGcsStorageProvider } from "./gcs.adapter";
import { createS3StorageProvider } from "./s3.adapter";
import type { IStorageProvider, StorageConfig } from "./storage.port";

// Único punto que conoce ambos adaptadores. Añadir un tercer proveedor = un
// `case` más aquí + un adaptador nuevo, sin tocar consumidores.
export const createStorageProvider = (
	config: StorageConfig,
	logger: Logger,
): IStorageProvider =>
	config.provider === "gcs"
		? createGcsStorageProvider(config, logger)
		: createS3StorageProvider(config, logger);

// Arma el StorageConfig desde el env YA VALIDADO del proyecto (no process.env
// crudo) y delega en createStorageProvider. La selección de proveedor es por
// STORAGE_PROVIDER ("s3" por defecto).
export const createStorageProviderFromEnv = (
	env: Env,
	logger: Logger,
): IStorageProvider => {
	if (env.STORAGE_PROVIDER === "gcs") {
		const config: StorageConfig = {
			provider: "gcs",
			credentialsPath: env.GCS_CREDENTIALS_PATH,
			credentialsBase64: env.GCS_CREDENTIALS_BASE64,
			useEmulator: env.USE_GCS_EMULATOR === "true",
			emulatorHost: env.GCS_EMULATOR_HOST,
			defaultBucket: env.STORAGE_BUCKET_NAME,
		};
		return createGcsStorageProvider(config, logger);
	}

	const config: StorageConfig = {
		provider: "s3",
		region: env.STORAGE_REGION || "",
		accessKeyId: env.STORAGE_ACCESS_KEY_ID || "",
		secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY || "",
		forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === "true",
		defaultBucket: env.STORAGE_BUCKET_NAME,
	};

	// Solo se añade si está presente: forzar un endpoint vacío contra AWS real
	// rompería la resolución del host del bucket.
	//
	// STORAGE_PUBLIC_DOMAIN NO viaja aquí: no es asunto del adaptador, sino de
	// cómo se PINTA una URL. Lo consume createAssetUrlResolver en el contenedor
	// (ver shared/storage/public-url.ts).
	if (env.STORAGE_ENDPOINT) config.endpoint = env.STORAGE_ENDPOINT;

	return createS3StorageProvider(config, logger);
};
