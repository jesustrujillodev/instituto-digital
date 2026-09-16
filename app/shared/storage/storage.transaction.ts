// Transacción compensatoria (unit-of-work) para storage. Construida SOBRE el
// puerto IStorageProvider (uploadFile/deleteFile/getPublicUrl) — no lo modifica,
// así funciona igual para S3 y GCS.
//
// El consumidor solo ejecuta su lógica dentro del callback; si algo lanza (una
// subida del lote, o un paso posterior como guardar en BD), storage revierte
// automáticamente todas las subidas registradas. En éxito, se commitean. El
// consumidor nunca rastrea keys ni llama a deleteFile.
//
// Nota sobre reintentos: los errores transitorios ya los reintentan los SDKs de
// AWS/GCS con backoff; aquí NO se añade un loop propio (duplicaría reintentos).

import type { Logger } from "@/shared/logging/logger";
import { buildObjectKey } from "./object-key";
import { StorageBatchError, StorageValidationError } from "./storage.errors";
import { type BucketPair, bucketForKey } from "./storage.policy";
import type { IStorageProvider } from "./storage.port";
import {
	type UploadInput,
	type UploadValidationOptions,
	validateUploadInput,
} from "./upload-validation";

export type { UploadInput } from "./upload-validation";

/** Referencia de un objeto subido: key cruda + referencia proxy persistible. */
export interface StorageRef {
	key: string;
	url: string;
	originalName: string;
}

export interface StorageTx {
	/** Sube un archivo (validado si hay opts) y lo registra para rollback. */
	upload(
		prefix: string,
		file: UploadInput,
		contentType?: string,
	): Promise<StorageRef>;
	/** Sube N archivos con semántica todo-o-nada (ver StorageBatchError). */
	uploadMany(prefix: string, files: UploadInput[]): Promise<StorageRef[]>;
	/** Registra una key ya existente (subida por fuera) para que entre al rollback. */
	track(key: string): void;
}

export interface StorageTxDeps {
	provider: IStorageProvider;
	logger: Logger;
	/**
	 * Buckets disponibles. El destino de cada archivo lo decide su key, no el
	 * consumidor: un mismo lote puede repartirse entre el bucket público y el
	 * privado (fotos de catálogo y documentos van juntas en un envío).
	 */
	buckets: BucketPair;
	validation?: UploadValidationOptions & { maxCount?: number };
}

/**
 * Ejecuta `fn` con una transacción de storage. Si `fn` (o cualquier subida)
 * lanza, se revierten TODAS las subidas registradas (best-effort) y se re-lanza
 * el error original. Si `fn` retorna, las subidas quedan commiteadas.
 */
export async function withStorageTransaction<T>(
	deps: StorageTxDeps,
	fn: (tx: StorageTx) => Promise<T>,
): Promise<T> {
	const { provider, logger, buckets, validation } = deps;
	const resolveBucket = (key: string) => bucketForKey(key, buckets);
	const trackedKeys: string[] = [];

	const doUpload = async (
		prefix: string,
		file: UploadInput,
		contentType?: string,
	): Promise<StorageRef> => {
		const key = buildObjectKey(prefix, file.name);
		const buffer = Buffer.from(await file.arrayBuffer());
		const bucket = resolveBucket(key);
		await provider.uploadFile(bucket, key, buffer, contentType ?? file.type);
		trackedKeys.push(key);
		return {
			key,
			url: provider.getPublicUrl(bucket, key),
			originalName: file.name,
		};
	};

	const tx: StorageTx = {
		async upload(prefix, file, contentType) {
			const reason = validateUploadInput(file, validation);
			if (reason) {
				throw new StorageValidationError([{ name: file.name, reason }]);
			}
			return doUpload(prefix, file, contentType);
		},

		async uploadMany(prefix, files) {
			// 1. Validar TODOS primero (fail-fast: no sube nada si algo no valida).
			if (
				validation?.maxCount !== undefined &&
				files.length > validation.maxCount
			) {
				throw new StorageValidationError([
					{
						name: `${files.length} archivos`,
						reason: `supera el máximo de ${validation.maxCount}`,
					},
				]);
			}
			const reasons = files
				.map((f) => ({
					name: f.name,
					reason: validateUploadInput(f, validation),
				}))
				.filter(
					(r): r is { name: string; reason: string } => r.reason !== null,
				);
			if (reasons.length > 0) throw new StorageValidationError(reasons);

			// 2. Subir en paralelo. Cada éxito registra su key vía doUpload.
			const results = await Promise.allSettled(
				files.map((f) => doUpload(prefix, f)),
			);

			// 3. Todo-o-nada: si algo falló, lanzamos; el wrapper revierte lo registrado.
			const failures = results
				.map((r, i) => ({ r, name: files[i].name }))
				.filter((x) => x.r.status === "rejected")
				.map((x) => ({
					name: x.name,
					error: String((x.r as PromiseRejectedResult).reason),
				}));
			if (failures.length > 0) throw new StorageBatchError(failures);

			return (results as PromiseFulfilledResult<StorageRef>[]).map(
				(r) => r.value,
			);
		},

		track(key) {
			trackedKeys.push(key);
		},
	};

	try {
		const result = await fn(tx);
		return result; // commit: las keys quedan
	} catch (error) {
		// Rollback best-effort: no debe enmascarar el error original.
		if (trackedKeys.length > 0) {
			const settled = await Promise.allSettled(
				// Cada key se borra en SU bucket: el rollback debe deshacer exactamente
				// donde se escribió, o dejaría huérfanos silenciosos.
				trackedKeys.map((key) => provider.deleteFile(resolveBucket(key), key)),
			);
			const notDeleted = settled
				.map((s, i) => ({ s, key: trackedKeys[i] }))
				.filter((x) => x.s.status === "rejected")
				.map((x) => x.key);
			if (notDeleted.length > 0) {
				logger.warn("[storage-tx] rollback: keys no borradas", {
					keys: notDeleted,
				});
			} else {
				logger.info("[storage-tx] rollback ejecutado", {
					count: trackedKeys.length,
				});
			}
		}
		throw error;
	}
}
