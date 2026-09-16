import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type {
	IObjectReferenceSource,
	ObjectReference,
} from "@/shared/storage/object-reference.port";
import { createAssetUrlResolver } from "@/shared/storage/public-url";
import type {
	IStorageProvider,
	ListObjectsOptions,
} from "@/shared/storage/storage.port";
import { CLOUD_LIMITS } from "../../domain/cloud.config";
import { CLOUD_ERROR_CODES } from "../../domain/cloud.errors";
import { createCloudService } from "../cloud.service.server";

const PRIVATE = "privado";
const PUBLIC = "publico";
const NOW = Date.parse("2026-09-14T12:00:00Z");
const OLD = new Date(NOW - 24 * 60 * 60 * 1000);
const FRESH = new Date(NOW - 60 * 1000);

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

type Stored = { size: number; lastModified: Date | null };

/**
 * Storage en memoria con la semántica real de prefijo, delimitador y cursor.
 * Un doble que devolviera listas fijas no probaría la fusión de buckets.
 */
const createMemoryStorage = (
	contents: Record<string, Record<string, Stored>>,
	options: { failDeleteOf?: string[] } = {},
) => {
	const buckets = new Map(
		Object.entries(contents).map(([bucket, objects]) => [
			bucket,
			new Map(Object.entries(objects)),
		]),
	);
	const signed: { bucket: string; key: string; ttl?: number }[] = [];
	const deleted: { bucket: string; keys: string[] }[] = [];

	const provider = {
		async listObjects(bucket: string, request: ListObjectsOptions = {}) {
			const prefix = request.prefix ?? "";
			const keys = [...(buckets.get(bucket)?.keys() ?? [])]
				.filter((key) => key.startsWith(prefix))
				.sort();

			const entries: { folder?: string; key?: string }[] = [];
			const seenFolders = new Set<string>();
			for (const key of keys) {
				const rest = key.slice(prefix.length);
				const slash = request.delimiter ? rest.indexOf("/") : -1;
				if (slash >= 0) {
					const folder = prefix + rest.slice(0, slash + 1);
					if (!seenFolders.has(folder)) {
						seenFolders.add(folder);
						entries.push({ folder });
					}
				} else {
					entries.push({ key });
				}
			}

			const start = request.cursor ? Number(request.cursor) : 0;
			const end = start + (request.limit ?? 1000);
			const page = entries.slice(start, end);

			return {
				folders: page.flatMap((entry) => (entry.folder ? [entry.folder] : [])),
				objects: page.flatMap((entry) =>
					entry.key
						? [
								{
									key: entry.key,
									...(buckets.get(bucket)?.get(entry.key) as Stored),
								},
							]
						: [],
				),
				nextCursor: end < entries.length ? String(end) : null,
			};
		},
		async deleteFiles(bucket: string, keys: readonly string[]) {
			deleted.push({ bucket, keys: [...keys] });
			const failed = keys.filter((key) => options.failDeleteOf?.includes(key));
			for (const key of keys) {
				if (!failed.includes(key)) buckets.get(bucket)?.delete(key);
			}
			return {
				deleted: keys.filter((key) => !failed.includes(key)),
				failed: failed.map((key) => ({ key, error: "403" })),
			};
		},
		async getPresignedUrl(bucket: string, key: string, ttl?: number) {
			signed.push({ bucket, key, ttl });
			return `https://firmada/${bucket}/${key}`;
		},
	} as unknown as IStorageProvider;

	return { provider, signed, deleted, buckets };
};

/** Fuente de referencias falsa: conoce las keys de `references`. */
const createSource = (
	references: ObjectReference[],
	options: { releaseFails?: boolean; folders?: Record<string, string> } = {},
) => {
	const released: string[][] = [];
	const source: IObjectReferenceSource = {
		async findByKeys(keys) {
			return references.filter((reference) => keys.includes(reference.key));
		},
		async release(keys) {
			if (options.releaseFails) throw new Error("la base no respondió");
			released.push([...keys]);
			return keys.length;
		},
		async describeFolders(prefixes) {
			return Object.entries(options.folders ?? {})
				.filter(([prefix]) => prefixes.includes(prefix))
				.map(([prefix, label]) => ({ prefix, label }));
		},
	};

	return { source, released };
};

const photoOf = (key: string, label = "Ana Ruiz"): ObjectReference => ({
	key,
	owner: "user",
	label,
	detail: "Foto",
	href: "/dashboard/usuarios/ana-ruiz",
});

const createHarness = (
	options: {
		storage?: ReturnType<typeof createMemoryStorage>;
		sources?: IObjectReferenceSource[];
		storageBucket?: string | null;
		storagePublicBucket?: string | null;
	} = {},
) => {
	const storage =
		options.storage ??
		createMemoryStorage({
			[PRIVATE]: {
				"documentos/cursos/factura.pdf": {
					size: 300,
					lastModified: OLD,
				},
				"profile-photos/ana.webp": { size: 50, lastModified: OLD },
			},
			[PUBLIC]: {
				"media/cursos/frente.jpg": { size: 100, lastModified: OLD },
				"media/cursos/trasera.jpg": { size: 200, lastModified: OLD },
				"media/suelta.jpg": { size: 10, lastModified: OLD },
			},
		});

	const service = createCloudService(
		{
			storageProvider: storage.provider,
			storageBucket:
				options.storageBucket === undefined ? PRIVATE : options.storageBucket,
			storagePublicBucket:
				options.storagePublicBucket === undefined
					? PUBLIC
					: options.storagePublicBucket,
			objectReferenceSources: (options.sources ??
				[]) as ICradle["objectReferenceSources"],
			assetUrlResolver: createAssetUrlResolver(null),
			logger: silentLogger,
		},
		() => NOW,
	);

	return { service, storage };
};

const errorCode = (result: { success: boolean; error?: { code: string } }) =>
	result.success ? null : result.error?.code;

describe("list — árbol unificado", () => {
	test("la raíz fusiona las carpetas de los dos buckets", async () => {
		const { service } = createHarness();

		const result = await service.list({ path: "" });

		expect(result.success && result.data.folders.map((f) => f.prefix)).toEqual([
			"documentos/",
			"media/",
			"profile-photos/",
		]);
	});

	test("cada carpeta lleva la visibilidad que decide la política", async () => {
		const { service } = createHarness();

		const result = await service.list({ path: "" });
		if (!result.success) throw new Error("debía listar");

		const visibility = Object.fromEntries(
			result.data.folders.map((folder) => [folder.prefix, folder.visibility]),
		);
		expect(visibility).toEqual({
			"media/": "public",
			"profile-photos/": "public",
			"documentos/": "private",
		});
	});

	test("una carpeta de catálogo solo se busca en el bucket público", async () => {
		const { service } = createHarness();

		const result = await service.list({ path: "media/cursos/" });
		if (!result.success) throw new Error("debía listar");

		expect(result.data.objects.map((object) => object.key)).toEqual([
			"media/cursos/frente.jpg",
			"media/cursos/trasera.jpg",
		]);
		expect(result.data.objects[0]).toMatchObject({
			name: "frente.jpg",
			size: 100,
			contentType: "image/jpeg",
			visibility: "public",
			previewUrl: "/api/storage?key=media%2Fcursos%2Ffrente.jpg",
			reference: null,
		});
	});

	test("descarta lo que está en el bucket equivocado", async () => {
		// Una foto de catálogo que quedó en el bucket privado no se puede servir
		// por el proxy: enseñarla solo produciría enlaces rotos.
		const storage = createMemoryStorage({
			[PRIVATE]: { "media/perdida.jpg": { size: 1, lastModified: OLD } },
			[PUBLIC]: { "media/buena.jpg": { size: 1, lastModified: OLD } },
		});
		const { service } = createHarness({ storage });

		const root = await service.list({ path: "" });
		const catalog = await service.list({ path: "media/" });

		expect(root.success && root.data.folders).toHaveLength(1);
		expect(
			catalog.success && catalog.data.objects.map((object) => object.key),
		).toEqual(["media/buena.jpg"]);
	});

	test("sin bucket público todo sale del bucket por defecto", async () => {
		const storage = createMemoryStorage({
			[PRIVATE]: {
				"media/a.jpg": { size: 1, lastModified: OLD },
				"documentos/b.pdf": { size: 1, lastModified: OLD },
			},
		});
		const { service } = createHarness({ storage, storagePublicBucket: null });

		const result = await service.list({ path: "" });

		expect(result.success && result.data.folders.map((f) => f.prefix)).toEqual([
			"documentos/",
			"media/",
		]);
	});

	test("resuelve referencias y nombres de carpeta con las fuentes", async () => {
		const { source } = createSource([photoOf("media/cursos/frente.jpg")], {
			folders: { "media/cursos/": "Ana Ruiz" },
		});
		const { service } = createHarness({ sources: [source] });

		const folder = await service.list({ path: "media/" });
		const files = await service.list({ path: "media/cursos/" });

		expect(folder.success && folder.data.folders[0].label).toBe("Ana Ruiz");
		// Las migas usan los mismos nombres que las carpetas.
		expect(files.success && files.data.trail).toEqual([
			{ prefix: "media/", name: "media", label: null },
			{
				prefix: "media/cursos/",
				name: "cursos",
				label: "Ana Ruiz",
			},
		]);
		expect(
			files.success &&
				files.data.objects.map((object) => object.reference?.label),
		).toEqual(["Ana Ruiz", undefined]);
	});

	test("pagina con un cursor que recuerda cada bucket", async () => {
		const many = Object.fromEntries(
			Array.from({ length: CLOUD_LIMITS.listPageSize + 5 }, (_, index) => [
				`documentos/doc-${String(index).padStart(3, "0")}.pdf`,
				{ size: 1, lastModified: OLD },
			]),
		);
		const storage = createMemoryStorage({ [PRIVATE]: many, [PUBLIC]: {} });
		const { service } = createHarness({ storage });

		const first = await service.list({ path: "documentos/" });
		if (!first.success) throw new Error("debía listar");
		expect(first.data.objects).toHaveLength(CLOUD_LIMITS.listPageSize);
		expect(first.data.nextCursor).not.toBeNull();

		const second = await service.list({
			path: "documentos/",
			cursor: first.data.nextCursor,
		});
		if (!second.success) throw new Error("debía listar");
		expect(second.data.objects).toHaveLength(5);
		expect(second.data.nextCursor).toBeNull();
	});

	test("un cursor inventado es un error tipado, no un 500", async () => {
		const { service } = createHarness();

		const result = await service.list({ path: "", cursor: "inventado" });

		expect(errorCode(result)).toBe(CLOUD_ERROR_CODES.INVALID_CURSOR);
	});

	test("sin storage configurado responde NOT_CONFIGURED", async () => {
		const { service } = createHarness({ storageBucket: null });

		const result = await service.list({ path: "" });

		expect(errorCode(result)).toBe(CLOUD_ERROR_CODES.NOT_CONFIGURED);
	});
});

describe("downloadUrl", () => {
	test("firma en el bucket de la key con la vida corta de descarga", async () => {
		const { service, storage } = createHarness();

		const result = await service.downloadUrl("documentos/cursos/factura.pdf");

		expect(result.success).toBe(true);
		expect(storage.signed).toEqual([
			{
				bucket: PRIVATE,
				key: "documentos/cursos/factura.pdf",
				ttl: CLOUD_LIMITS.downloadUrlTtlS,
			},
		]);
	});
});

describe("zipManifest", () => {
	test("una carpeta produce un ZIP con su nombre y rutas relativas a ella", async () => {
		const { service } = createHarness();

		const result = await service.zipManifest({
			keys: [],
			prefixes: ["media/cursos/"],
		});
		if (!result.success) throw new Error("debía armar el manifiesto");

		expect(result.data.fileName).toBe("cursos.zip");
		expect(result.data.totalBytes).toBe(300);
		expect(result.data.entries.map((entry) => entry.path)).toEqual([
			"cursos/frente.jpg",
			"cursos/trasera.jpg",
		]);
	});

	test("una selección mixta recorre los dos buckets", async () => {
		const { service, storage } = createHarness();

		const result = await service.zipManifest({
			keys: ["media/suelta.jpg"],
			prefixes: ["documentos/cursos/"],
		});
		if (!result.success) throw new Error("debía armar el manifiesto");

		expect(result.data.fileName).toBe("nube.zip");
		expect(result.data.entries.map((entry) => entry.path)).toEqual([
			"documentos/cursos/factura.pdf",
			"media/suelta.jpg",
		]);
		expect(new Set(storage.signed.map((entry) => entry.bucket))).toEqual(
			new Set([PRIVATE, PUBLIC]),
		);
		expect(
			storage.signed.every((entry) => entry.ttl === CLOUD_LIMITS.zipUrlTtlS),
		).toBe(true);
	});

	test("una key que ya no existe se ignora", async () => {
		const { service } = createHarness();

		const result = await service.zipManifest({
			keys: ["media/cursos/frente.jpg", "media/cursos/borrada.jpg"],
			prefixes: [],
		});

		expect(result.success && result.data.entries).toHaveLength(1);
	});

	test("rechaza un ZIP demasiado grande ANTES de firmar nada", async () => {
		const storage = createMemoryStorage({
			[PRIVATE]: {},
			[PUBLIC]: {
				"media/enorme.jpg": {
					size: CLOUD_LIMITS.zipMaxBytes + 1,
					lastModified: OLD,
				},
			},
		});
		const { service } = createHarness({ storage });

		const result = await service.zipManifest({
			keys: [],
			prefixes: ["media/"],
		});

		expect(errorCode(result)).toBe(CLOUD_ERROR_CODES.ZIP_TOO_LARGE);
		expect(storage.signed).toEqual([]);
	});

	test("una selección sin objetos existentes es un error tipado", async () => {
		const { service } = createHarness();

		const result = await service.zipManifest({
			keys: ["media/no-existe.jpg"],
			prefixes: [],
		});

		expect(errorCode(result)).toBe(CLOUD_ERROR_CODES.NOTHING_SELECTED);
	});
});

describe("previewDelete", () => {
	test("cuenta objetos y agrupa lo que está en uso por dueño", async () => {
		const { source } = createSource([
			photoOf("media/cursos/frente.jpg"),
			photoOf("media/cursos/trasera.jpg"),
		]);
		const { service, storage } = createHarness({ sources: [source] });

		const result = await service.previewDelete({
			keys: ["media/suelta.jpg"],
			prefixes: ["media/cursos/"],
		});

		expect(result.success && result.data).toEqual({
			objectCount: 3,
			totalBytes: 310,
			owners: [
				{
					owner: "user",
					label: "Ana Ruiz",
					href: "/dashboard/usuarios/ana-ruiz",
					count: 2,
				},
			],
		});
		// Solo mira: no borra nada.
		expect(storage.deleted).toEqual([]);
	});

	test("una carpeta más grande que el tope se rechaza entera", async () => {
		const many = Object.fromEntries(
			Array.from(
				{ length: CLOUD_LIMITS.folderOperationMaxObjects + 1 },
				(_, index) => [`media/x/${index}.jpg`, { size: 1, lastModified: OLD }],
			),
		);
		const storage = createMemoryStorage({ [PRIVATE]: {}, [PUBLIC]: many });
		const { service } = createHarness({ storage });

		const result = await service.previewDelete({
			keys: [],
			prefixes: ["media/x/"],
		});

		expect(errorCode(result)).toBe(CLOUD_ERROR_CODES.FOLDER_TOO_LARGE);
	});
});

describe("delete — cascada", () => {
	test("suelta las referencias en la base y después borra en cada bucket", async () => {
		const { source, released } = createSource([
			photoOf("media/cursos/frente.jpg"),
		]);
		const { service, storage } = createHarness({ sources: [source] });

		const result = await service.delete(
			{
				keys: ["documentos/cursos/factura.pdf"],
				prefixes: ["media/cursos/"],
			},
			{ userId: 7 },
		);

		expect(result.success && result.data).toEqual({
			deleted: 3,
			failed: [],
			released: 1,
		});
		expect(released).toEqual([["media/cursos/frente.jpg"]]);
		expect(storage.deleted).toEqual(
			expect.arrayContaining([
				{
					bucket: PUBLIC,
					keys: ["media/cursos/frente.jpg", "media/cursos/trasera.jpg"],
				},
				{ bucket: PRIVATE, keys: ["documentos/cursos/factura.pdf"] },
			]),
		);
	});

	test("si soltar la referencia falla, NO se borra ningún objeto", async () => {
		// Mejor no borrar nada que dejar una ficha apuntando a fotos inexistentes.
		const { source } = createSource([photoOf("media/cursos/frente.jpg")], {
			releaseFails: true,
		});
		const { service, storage } = createHarness({ sources: [source] });

		const result = await service.delete(
			{ keys: [], prefixes: ["media/cursos/"] },
			{ userId: 7 },
		);

		expect(result.success).toBe(false);
		expect(storage.deleted).toEqual([]);
	});

	test("lo que el proveedor no pudo borrar se reporta sin tumbar la operación", async () => {
		const storage = createMemoryStorage(
			{
				[PRIVATE]: {},
				[PUBLIC]: {
					"media/a.jpg": { size: 1, lastModified: OLD },
					"media/b.jpg": { size: 1, lastModified: OLD },
				},
			},
			{ failDeleteOf: ["media/b.jpg"] },
		);
		const { service } = createHarness({ storage });

		const result = await service.delete(
			{ keys: ["media/a.jpg", "media/b.jpg"], prefixes: [] },
			{ userId: 7 },
		);

		expect(result.success && result.data).toEqual({
			deleted: 1,
			failed: ["media/b.jpg"],
			released: 0,
		});
	});
});

describe("scanOrphans", () => {
	test("es huérfano lo que no tiene referencia y ya pasó la ventana de gracia", async () => {
		const storage = createMemoryStorage({
			[PRIVATE]: {},
			[PUBLIC]: {
				"media/cursos/en-uso.jpg": { size: 1, lastModified: OLD },
				"media/resto-de-prueba.jpg": { size: 1, lastModified: OLD },
				// Subida hace un minuto: puede ser un guardado en curso.
				"media/cursos/subiendo.jpg": { size: 1, lastModified: FRESH },
				"media/sin-fecha.jpg": { size: 1, lastModified: null },
			},
		});
		const { source } = createSource([photoOf("media/cursos/en-uso.jpg")]);
		const { service } = createHarness({ storage, sources: [source] });

		const result = await service.scanOrphans("media/");
		if (!result.success) throw new Error("debía escanear");

		expect(result.data.scanned).toBe(4);
		expect(result.data.truncated).toBe(false);
		expect(result.data.orphans.map((object) => object.key)).toEqual([
			"media/resto-de-prueba.jpg",
		]);
	});

	test("desde la raíz recorre los dos buckets", async () => {
		const { service } = createHarness();

		const result = await service.scanOrphans("");

		expect(result.success && result.data.orphans).toHaveLength(5);
	});
});
