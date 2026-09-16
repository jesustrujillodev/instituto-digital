import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { contentTypeForKey } from "@/shared/storage/mime";
import type {
	FolderDescription,
	IObjectReferenceSource,
	ObjectReference,
} from "@/shared/storage/object-reference.port";
import { collectObjects } from "@/shared/storage/storage.listing";
import {
	type BucketPair,
	bucketForKey,
	CDN_PREFIXES,
	isCdnKey,
	isPublicKey,
} from "@/shared/storage/storage.policy";
import type { StorageObject } from "@/shared/storage/storage.port";
import { CLOUD_LIMITS, PREVIEWABLE_IMAGE_TYPES } from "../domain/cloud.config";
import {
	CloudFolderTooLargeError,
	CloudNotConfiguredError,
	CloudNothingSelectedError,
	CloudZipTooLargeError,
	InvalidCloudCursorError,
} from "../domain/cloud.errors";
import {
	type BucketCursors,
	commonFolder,
	decodeCursor,
	encodeCursor,
	folderTrail,
	lastSegment,
	parentFolder,
} from "../domain/cloud.paths";
import type { ICloudService } from "../domain/cloud.service";
import type {
	CloudFolder,
	CloudObject,
	CloudSelection,
	DeleteImpactOwner,
} from "../domain/cloud.types";

type Dependencies = {
	storageProvider: ICradle["storageProvider"];
	// Los buckets llegan resueltos desde el composition root: este caso de uso no
	// lee `env` (docs/reglas.md §11.4).
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
	objectReferenceSources: ICradle["objectReferenceSources"];
	assetUrlResolver: ICradle["assetUrlResolver"];
	logger: ICradle["logger"];
};

/** Objeto localizado: sus metadatos más el bucket donde se encontró. */
type Located = StorageObject & { bucket: string };

type ResolvedReference = {
	reference: ObjectReference;
	source: IObjectReferenceSource;
};

/**
 * @param now Reloj inyectable para la ventana de gracia de huérfanos. Va como
 *   segundo argumento y no en `Dependencies` porque Awilix resuelve cada clave
 *   de ese objeto contra el contenedor.
 */
export const createCloudService = (
	{
		storageProvider,
		storageBucket,
		storagePublicBucket,
		objectReferenceSources,
		assetUrlResolver,
		logger,
	}: Dependencies,
	now: () => number = Date.now,
): ICloudService => {
	const log = logger.child({ module: "cloud" });
	const run = createOperationRunner(log);

	const requireBuckets = (): BucketPair => {
		if (!storageBucket) throw new CloudNotConfiguredError();

		return {
			defaultBucket: storageBucket,
			// El mismo nombre en las dos variables es el modo de un bucket: tratarlo
			// como dos listaría cada objeto dos veces.
			publicBucket:
				storagePublicBucket && storagePublicBucket !== storageBucket
					? storagePublicBucket
					: null,
		};
	};

	/**
	 * Buckets que pueden alojar objetos bajo `prefix`.
	 *
	 * Es la misma política que decide dónde se ESCRIBE (`bucketForKey`), aplicada
	 * a una carpeta: `media/…` solo vive en el público; la raíz, que contiene a
	 * `media/`, en los dos; el resto, solo en el de por defecto.
	 */
	const bucketsFor = (prefix: string, buckets: BucketPair): string[] => {
		const { defaultBucket, publicBucket } = buckets;
		if (!publicBucket) return [defaultBucket];
		if (isCdnKey(prefix)) return [publicBucket];

		const containsCdnPrefix = CDN_PREFIXES.some((cdn) =>
			cdn.startsWith(prefix),
		);

		return containsCdnPrefix ? [defaultBucket, publicBucket] : [defaultBucket];
	};

	/**
	 * `true` si la ruta se encontró en el bucket donde la política dice que vive.
	 *
	 * Un objeto en el bucket equivocado (p. ej. una foto de catálogo subida antes
	 * de separar buckets) no se puede servir por el proxy ni borrar por la ruta
	 * normal: enseñarlo solo produciría enlaces y borrados que fallan.
	 */
	const belongsTo = (path: string, bucket: string, buckets: BucketPair) =>
		bucketForKey(path, buckets) === bucket;

	const resolveReferences = async (
		keys: readonly string[],
	): Promise<Map<string, ResolvedReference>> => {
		const found = new Map<string, ResolvedReference>();

		for (
			let start = 0;
			start < keys.length;
			start += CLOUD_LIMITS.referenceLookupChunk
		) {
			const chunk = keys.slice(
				start,
				start + CLOUD_LIMITS.referenceLookupChunk,
			);
			const results = await Promise.all(
				objectReferenceSources.map(async (source) => ({
					source,
					references: await source.findByKeys(chunk),
				})),
			);

			for (const { source, references } of results) {
				for (const reference of references) {
					if (!found.has(reference.key)) {
						found.set(reference.key, { reference, source });
					}
				}
			}
		}

		return found;
	};

	const describeFolders = async (
		prefixes: readonly string[],
	): Promise<Map<string, FolderDescription>> => {
		const descriptions = new Map<string, FolderDescription>();
		if (prefixes.length === 0) return descriptions;

		const results = await Promise.all(
			objectReferenceSources.map((source) => source.describeFolders(prefixes)),
		);
		for (const description of results.flat()) {
			if (!descriptions.has(description.prefix)) {
				descriptions.set(description.prefix, description);
			}
		}

		return descriptions;
	};

	const visibilityOf = (path: string) =>
		isPublicKey(path) ? ("public" as const) : ("private" as const);

	const toCloudObject = (
		object: StorageObject,
		reference: ObjectReference | null,
	): CloudObject => {
		const contentType = contentTypeForKey(object.key);

		return {
			key: object.key,
			name: lastSegment(object.key),
			size: object.size,
			lastModified: object.lastModified,
			contentType,
			visibility: visibilityOf(object.key),
			previewUrl: PREVIEWABLE_IMAGE_TYPES.includes(contentType)
				? assetUrlResolver(object.key)
				: null,
			reference,
		};
	};

	/**
	 * Convierte la selección (keys sueltas + carpetas) en la lista de objetos que
	 * EXISTEN, sin duplicados.
	 *
	 * @throws CloudFolderTooLargeError si abarca más de `maxObjects`: se rechaza
	 *   entera, nunca se procesa a medias.
	 */
	const expandSelection = async (
		selection: CloudSelection,
		buckets: BucketPair,
		maxObjects: number,
	): Promise<Located[]> => {
		const located = new Map<string, Located>();
		const add = (object: StorageObject, bucket: string) => {
			located.set(object.key, { ...object, bucket });
			if (located.size > maxObjects) {
				throw new CloudFolderTooLargeError(maxObjects);
			}
		};

		for (const prefix of selection.prefixes) {
			for (const bucket of bucketsFor(prefix, buckets)) {
				const { objects, truncated } = await collectObjects(
					storageProvider,
					bucket,
					prefix,
					{ maxObjects: Math.max(0, maxObjects - located.size) },
				);
				if (truncated) throw new CloudFolderTooLargeError(maxObjects);

				for (const object of objects) {
					if (belongsTo(object.key, bucket, buckets)) add(object, bucket);
				}
			}
		}

		// Las keys sueltas se buscan listando su carpeta: es lo que da su tamaño
		// (lo necesita el ZIP) y confirma que siguen existiendo. Una selección sale
		// casi siempre de la carpeta que se está viendo, así que es un listado.
		const pending = new Map<string, Set<string>>();
		for (const key of selection.keys) {
			if (located.has(key)) continue;

			const group = `${bucketForKey(key, buckets)}\n${parentFolder(key)}`;
			const wanted = pending.get(group) ?? new Set<string>();
			wanted.add(key);
			pending.set(group, wanted);
		}

		for (const [group, wanted] of pending) {
			const [bucket, folder] = group.split("\n");
			let cursor: string | null = null;

			do {
				const page = await storageProvider.listObjects(bucket, {
					prefix: folder,
					delimiter: "/",
					cursor,
				});
				for (const object of page.objects) {
					if (wanted.delete(object.key)) add(object, bucket);
				}
				cursor = page.nextCursor;
			} while (cursor && wanted.size > 0);
		}

		return [...located.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
	};

	const groupBy = <T>(items: readonly T[], keyOf: (item: T) => string) => {
		const groups = new Map<string, T[]>();
		for (const item of items) {
			const key = keyOf(item);
			groups.set(key, [...(groups.get(key) ?? []), item]);
		}
		return groups;
	};

	return {
		async list({ path, cursor }) {
			return run("list", async () => {
				const buckets = requireBuckets();
				const targets = bucketsFor(path, buckets);
				const previous = cursor ? decodeCursor(cursor) : null;

				// Con cursor solo se piden los buckets que aún tenían páginas.
				const toQuery = previous
					? targets.filter((bucket) => bucket in previous)
					: targets;
				if (previous && toQuery.length === 0) {
					throw new InvalidCloudCursorError();
				}

				const pages = await Promise.all(
					toQuery.map(async (bucket) => ({
						bucket,
						page: await storageProvider.listObjects(bucket, {
							prefix: path,
							delimiter: "/",
							cursor: previous?.[bucket] ?? null,
							limit: CLOUD_LIMITS.listPageSize,
						}),
					})),
				);

				const folderPrefixes = new Set<string>();
				const objects: StorageObject[] = [];
				const nextCursors: BucketCursors = {};

				for (const { bucket, page } of pages) {
					for (const folder of page.folders) {
						if (belongsTo(folder, bucket, buckets)) folderPrefixes.add(folder);
					}
					for (const object of page.objects) {
						if (belongsTo(object.key, bucket, buckets)) objects.push(object);
					}
					if (page.nextCursor) nextCursors[bucket] = page.nextCursor;
				}

				const prefixes = [...folderPrefixes].sort();
				const trail = folderTrail(path);
				// Una sola consulta de nombres para las subcarpetas y para las migas.
				const [references, descriptions] = await Promise.all([
					resolveReferences(objects.map((object) => object.key)),
					describeFolders([...prefixes, ...trail.map((crumb) => crumb.prefix)]),
				]);

				const folders: CloudFolder[] = prefixes.map((prefix) => {
					const description = descriptions.get(prefix);

					return {
						prefix,
						name: lastSegment(prefix),
						label: description?.label ?? null,
						href: description?.href ?? null,
						visibility: visibilityOf(prefix),
					};
				});

				return ok({
					path,
					trail: trail.map((crumb) => ({
						...crumb,
						label: descriptions.get(crumb.prefix)?.label ?? null,
					})),
					folders,
					objects: objects
						.sort((a, b) => (a.key < b.key ? -1 : 1))
						.map((object) =>
							toCloudObject(
								object,
								references.get(object.key)?.reference ?? null,
							),
						),
					nextCursor: encodeCursor(nextCursors),
				});
			});
		},

		async downloadUrl(key) {
			return run("downloadUrl", async () => {
				const buckets = requireBuckets();
				const url = await storageProvider.getPresignedUrl(
					bucketForKey(key, buckets),
					key,
					CLOUD_LIMITS.downloadUrlTtlS,
					{ disposition: "attachment" },
				);

				return ok({ url });
			});
		},

		async zipManifest(selection) {
			return run("zipManifest", async () => {
				const buckets = requireBuckets();
				const objects = await expandSelection(
					selection,
					buckets,
					CLOUD_LIMITS.folderOperationMaxObjects,
				);
				if (objects.length === 0) throw new CloudNothingSelectedError();

				const totalBytes = objects.reduce(
					(sum, object) => sum + object.size,
					0,
				);
				// Antes de firmar nada: un ZIP que el navegador no podrá terminar no
				// debe empezar.
				if (totalBytes > CLOUD_LIMITS.zipMaxBytes) {
					throw new CloudZipTooLargeError(CLOUD_LIMITS.zipMaxBytes, totalBytes);
				}

				const base = commonFolder([...selection.keys, ...selection.prefixes]);
				const onlyFolder =
					selection.prefixes.length === 1 && selection.keys.length === 0
						? selection.prefixes[0]
						: null;
				const zipName = onlyFolder
					? lastSegment(onlyFolder)
					: base
						? lastSegment(base)
						: "nube";

				const entries = await Promise.all(
					objects.map(async (object) => ({
						path: object.key.slice(base.length),
						size: object.size,
						url: await storageProvider.getPresignedUrl(
							object.bucket,
							object.key,
							CLOUD_LIMITS.zipUrlTtlS,
							{ disposition: "attachment" },
						),
					})),
				);

				return ok({ fileName: `${zipName}.zip`, totalBytes, entries });
			});
		},

		async previewDelete(selection) {
			return run("previewDelete", async () => {
				const buckets = requireBuckets();
				const objects = await expandSelection(
					selection,
					buckets,
					CLOUD_LIMITS.folderOperationMaxObjects,
				);
				if (objects.length === 0) throw new CloudNothingSelectedError();

				const references = await resolveReferences(
					objects.map((object) => object.key),
				);

				// Agrupado por DUEÑO, no por archivo: lo que importa antes de
				// confirmar es "esto afecta a 2 vehículos", no la lista de fotos.
				const owners = new Map<string, DeleteImpactOwner>();
				for (const { reference } of references.values()) {
					const id = `${reference.owner}:${reference.href ?? reference.label}`;
					const current = owners.get(id);
					owners.set(id, {
						owner: reference.owner,
						label: reference.label,
						...(reference.href && { href: reference.href }),
						count: (current?.count ?? 0) + 1,
					});
				}

				return ok({
					objectCount: objects.length,
					totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
					owners: [...owners.values()],
				});
			});
		},

		async delete(selection, actor) {
			return run("delete", async () => {
				const buckets = requireBuckets();
				const objects = await expandSelection(
					selection,
					buckets,
					CLOUD_LIMITS.folderOperationMaxObjects,
				);
				if (objects.length === 0) throw new CloudNothingSelectedError();

				const references = await resolveReferences(
					objects.map((object) => object.key),
				);

				// 1. PRIMERO la base. Si soltar una referencia falla, se lanza y no se
				//    borra ningún objeto: mejor no borrar nada que dejar fichas
				//    apuntando a archivos que ya no existen.
				const keysBySource = new Map<IObjectReferenceSource, string[]>();
				for (const [key, { source }] of references) {
					keysBySource.set(source, [...(keysBySource.get(source) ?? []), key]);
				}

				let released = 0;
				for (const [source, keys] of keysBySource) {
					released += await source.release(keys);
				}

				// 2. Después storage, best-effort. Lo que no se pueda borrar queda
				//    huérfano —ya sin referencias— y el escaneo lo vuelve a encontrar.
				const results = await Promise.all(
					[...groupBy(objects, (object) => object.bucket)].map(
						([bucket, inBucket]) =>
							storageProvider.deleteFiles(
								bucket,
								inBucket.map((object) => object.key),
							),
					),
				);

				const deleted = results.reduce(
					(sum, result) => sum + result.deleted.length,
					0,
				);
				const failed = results.flatMap((result) =>
					result.failed.map((entry) => entry.key),
				);

				// No hay tabla de auditoría: el log es el registro de quién borró qué.
				log.info("[cloud] borrado", {
					actorId: actor.userId,
					prefixes: selection.prefixes,
					keys: selection.keys.length,
					deleted,
					failed: failed.length,
					released,
				});

				return ok({ deleted, failed, released });
			});
		},

		async scanOrphans(prefix) {
			return run("scanOrphans", async () => {
				const buckets = requireBuckets();
				const found: Located[] = [];
				let scanned = 0;
				let truncated = false;

				for (const bucket of bucketsFor(prefix, buckets)) {
					const remaining = CLOUD_LIMITS.orphanScanMaxObjects - scanned;
					if (remaining <= 0) {
						truncated = true;
						break;
					}

					const result = await collectObjects(storageProvider, bucket, prefix, {
						maxObjects: remaining,
					});
					scanned += result.objects.length;
					truncated ||= result.truncated;

					for (const object of result.objects) {
						if (belongsTo(object.key, bucket, buckets)) {
							found.push({ ...object, bucket });
						}
					}
				}

				const references = await resolveReferences(
					found.map((object) => object.key),
				);
				const cutoff = now() - CLOUD_LIMITS.orphanGraceMs;

				const orphans = found
					.filter(
						(object) =>
							!references.has(object.key) &&
							// Sin fecha no se puede descartar que se esté subiendo ahora
							// mismo: ante la duda, no es huérfano.
							object.lastModified !== null &&
							object.lastModified.getTime() < cutoff,
					)
					.sort((a, b) => (a.key < b.key ? -1 : 1))
					.map((object) => toCloudObject(object, null));

				return ok({ prefix, scanned, truncated, orphans });
			});
		},
	};
};
