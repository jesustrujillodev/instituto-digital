import { describe, expect, test } from "vitest";
import type { LogData, Logger } from "@/shared/logging/logger";
import { StorageBatchError, StorageValidationError } from "../storage.errors";
import type { IStorageProvider } from "../storage.port";
import { withStorageTransaction } from "../storage.transaction";
import type { UploadInput } from "../upload-validation";

const BUCKET = "test-bucket";

type Entry = { level: string; message: string; data?: LogData };

const createSpyLogger = () => {
	const entries: Entry[] = [];
	const logger: Logger = {
		debug: (message, data) => entries.push({ level: "debug", message, data }),
		info: (message, data) => entries.push({ level: "info", message, data }),
		warn: (message, data) => entries.push({ level: "warn", message, data }),
		error: (message, data) => entries.push({ level: "error", message, data }),
		child: () => logger,
	};
	return { logger, entries };
};

/**
 * Proveedor falso con registro de llamadas y fallos programables por nombre de
 * archivo. Solo implementa los tres métodos que toca la transacción.
 */
const createFakeProvider = (
	options: { failUploadFor?: string[]; failDeleteFor?: string[] } = {},
) => {
	const calls = { uploaded: [] as string[], deleted: [] as string[] };

	const provider = {
		async uploadFile(_bucket: string, key: string) {
			if (options.failUploadFor?.some((name) => key.includes(name))) {
				throw new Error(`upload falló para ${key}`);
			}
			calls.uploaded.push(key);
		},
		async deleteFile(_bucket: string, key: string) {
			if (options.failDeleteFor?.some((name) => key.includes(name))) {
				throw new Error(`delete falló para ${key}`);
			}
			calls.deleted.push(key);
		},
		getPublicUrl: (_bucket: string, key: string) =>
			`/api/storage?key=${encodeURIComponent(key)}`,
	} as unknown as IStorageProvider;

	return { provider, calls };
};

const fileOf = (overrides: Partial<UploadInput> = {}): UploadInput => ({
	name: "foto.png",
	type: "image/png",
	size: 1024,
	arrayBuffer: async () => new ArrayBuffer(8),
	...overrides,
});

const depsOf = (
	provider: IStorageProvider,
	logger: Logger,
	validation?: Parameters<typeof withStorageTransaction>[0]["validation"],
) => ({
	provider,
	logger,
	buckets: { defaultBucket: BUCKET },
	validation,
});

describe("withStorageTransaction — commit", () => {
	test("returns what the callback returns and keeps the uploads", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		const result = await withStorageTransaction(
			depsOf(provider, logger),
			async (tx) => {
				await tx.upload("profile-photos", fileOf());
				return { saved: true };
			},
		);

		expect(result).toEqual({ saved: true });
		expect(calls.uploaded).toHaveLength(1);
		expect(calls.deleted).toEqual([]);
	});

	// La referencia que se persiste es la del PROXY, no la del proveedor: así
	// cambiar S3↔GCS no invalida lo guardado.
	test("hands back the key, the proxy url and the original name", async () => {
		const { provider } = createFakeProvider();
		const { logger } = createSpyLogger();

		const ref = await withStorageTransaction(
			depsOf(provider, logger),
			async (tx) => tx.upload("profile-photos", fileOf({ name: "ana.png" })),
		);

		expect(ref.key).toMatch(/^profile-photos\/ana-\d+\.png$/);
		expect(ref.url).toBe(`/api/storage?key=${encodeURIComponent(ref.key)}`);
		expect(ref.originalName).toBe("ana.png");
	});

	test("logs nothing about rollback on the happy path", async () => {
		const { provider } = createFakeProvider();
		const { logger, entries } = createSpyLogger();

		await withStorageTransaction(depsOf(provider, logger), async (tx) => {
			await tx.upload("p", fileOf());
		});

		expect(entries).toEqual([]);
	});
});

describe("withStorageTransaction — rollback", () => {
	// El motivo de existir de la primitiva: si el paso POSTERIOR a la subida falla
	// (guardar en la base), el objeto ya subido quedaría huérfano en el bucket para
	// siempre. El consumidor no rastrea keys ni llama a deleteFile.
	test("deletes every tracked upload when the callback throws", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		await expect(
			withStorageTransaction(depsOf(provider, logger), async (tx) => {
				await tx.upload("p", fileOf({ name: "a.png" }));
				await tx.upload("p", fileOf({ name: "b.png" }));
				throw new Error("la base falló");
			}),
		).rejects.toThrow("la base falló");

		expect(calls.deleted).toHaveLength(2);
		expect(calls.deleted).toEqual(calls.uploaded);
	});

	// El rollback no debe enmascarar la causa: quien depura necesita ver el error
	// original, no un "no se pudo borrar".
	test("rethrows the ORIGINAL error, not a rollback one", async () => {
		const { provider } = createFakeProvider({ failDeleteFor: ["/a-"] });
		const { logger } = createSpyLogger();
		const original = new Error("la base falló");

		const thrown = await withStorageTransaction(
			depsOf(provider, logger),
			async (tx) => {
				await tx.upload("p", fileOf({ name: "a.png" }));
				throw original;
			},
		).catch((e) => e);

		expect(thrown).toBe(original);
	});

	test("logs info with the count when the rollback succeeds", async () => {
		const { provider } = createFakeProvider();
		const { logger, entries } = createSpyLogger();

		await withStorageTransaction(depsOf(provider, logger), async (tx) => {
			await tx.upload("p", fileOf());
			throw new Error("boom");
		}).catch(() => {});

		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe("info");
		expect(entries[0].data?.count).toBe(1);
	});

	// Best-effort: si el borrado falla, las keys quedan huérfanas y eso tiene que
	// constar en el log para que alguien pueda limpiarlas a mano.
	test("logs warn with the orphaned keys when the rollback fails", async () => {
		const { provider } = createFakeProvider({ failDeleteFor: ["/a-"] });
		const { logger, entries } = createSpyLogger();

		await withStorageTransaction(depsOf(provider, logger), async (tx) => {
			await tx.upload("p", fileOf({ name: "a.png" }));
			throw new Error("boom");
		}).catch(() => {});

		expect(entries[0].level).toBe("warn");
		const orphaned = entries[0].data?.keys as string[];
		expect(orphaned[0]).toContain("a-");
	});

	test("logs nothing when there was nothing to roll back", async () => {
		const { provider } = createFakeProvider();
		const { logger, entries } = createSpyLogger();

		await withStorageTransaction(depsOf(provider, logger), async () => {
			throw new Error("boom");
		}).catch(() => {});

		expect(entries).toEqual([]);
	});

	// track() es la escotilla para objetos subidos por fuera de la transacción
	// (p. ej. por un servicio que ya tenía su propia subida): entran al rollback
	// igual que los de tx.upload.
	test("track() brings an externally uploaded key into the rollback", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		await withStorageTransaction(depsOf(provider, logger), async (tx) => {
			tx.track("documents/subido-por-fuera.pdf");
			throw new Error("boom");
		}).catch(() => {});

		expect(calls.deleted).toEqual(["documents/subido-por-fuera.pdf"]);
	});
});

describe("withStorageTransaction — upload validation", () => {
	test("rejects a file that fails validation without uploading it", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		await expect(
			withStorageTransaction(
				depsOf(provider, logger, { allowedTypes: ["image/png"] }),
				async (tx) => tx.upload("p", fileOf({ type: "application/pdf" })),
			),
		).rejects.toBeInstanceOf(StorageValidationError);

		expect(calls.uploaded).toEqual([]);
	});

	test("uploads with the explicit contentType when one is given", async () => {
		const { provider } = createFakeProvider();
		const { logger } = createSpyLogger();

		const ref = await withStorageTransaction(
			depsOf(provider, logger),
			async (tx) => tx.upload("p", fileOf(), "image/webp"),
		);

		expect(ref.key).toBeDefined();
	});

	test("without validation options anything but an empty file goes through", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		await withStorageTransaction(depsOf(provider, logger), async (tx) => {
			await tx.upload("p", fileOf({ type: "application/x-msdownload" }));
		});

		expect(calls.uploaded).toHaveLength(1);
	});
});

describe("withStorageTransaction — uploadMany", () => {
	test("uploads every file and returns one ref per file", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		const refs = await withStorageTransaction(
			depsOf(provider, logger),
			async (tx) =>
				tx.uploadMany("media", [
					fileOf({ name: "a.png" }),
					fileOf({ name: "b.png" }),
				]),
		);

		expect(refs).toHaveLength(2);
		expect(calls.uploaded).toHaveLength(2);
	});

	// Fail-fast: se valida el lote ENTERO antes de subir nada. Subir la mitad y
	// luego revertir cuesta tráfico y deja una ventana en la que el objeto existe.
	test("validates the WHOLE batch before uploading anything", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		await expect(
			withStorageTransaction(
				depsOf(provider, logger, { allowedTypes: ["image/png"] }),
				async (tx) =>
					tx.uploadMany("media", [
						fileOf({ name: "ok.png" }),
						fileOf({ name: "malo.pdf", type: "application/pdf" }),
					]),
			),
		).rejects.toBeInstanceOf(StorageValidationError);

		expect(calls.uploaded).toEqual([]);
	});

	test("reports every invalid file, not just the first", async () => {
		const { provider } = createFakeProvider();
		const { logger } = createSpyLogger();

		const thrown = await withStorageTransaction(
			depsOf(provider, logger, { allowedTypes: ["image/png"] }),
			async (tx) =>
				tx.uploadMany("media", [
					fileOf({ name: "a.pdf", type: "application/pdf" }),
					fileOf({ name: "b.gif", type: "image/gif" }),
				]),
		).catch((e) => e);

		expect(thrown.reasons).toHaveLength(2);
	});

	test("enforces maxCount before validating the files one by one", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		const thrown = await withStorageTransaction(
			depsOf(provider, logger, { maxCount: 1 }),
			async (tx) =>
				tx.uploadMany("media", [
					fileOf({ name: "a.png" }),
					fileOf({ name: "b.png" }),
				]),
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(StorageValidationError);
		expect(thrown.reasons[0].reason).toContain("supera el máximo de 1");
		expect(calls.uploaded).toEqual([]);
	});

	// Todo-o-nada: si una subida del lote falla, las que sí subieron se revierten.
	// Un catálogo con 2 de 3 fotos es un estado que nadie pidió.
	test("a partial failure throws StorageBatchError and rolls back the rest", async () => {
		const { provider, calls } = createFakeProvider({ failUploadFor: ["b-"] });
		const { logger } = createSpyLogger();

		const thrown = await withStorageTransaction(
			depsOf(provider, logger),
			async (tx) =>
				tx.uploadMany("media", [
					fileOf({ name: "a.png" }),
					fileOf({ name: "b.png" }),
					fileOf({ name: "c.png" }),
				]),
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(StorageBatchError);
		expect(thrown.failures.map((f: { name: string }) => f.name)).toEqual([
			"b.png",
		]);
		expect(calls.uploaded).toHaveLength(2);
		expect(calls.deleted).toEqual(calls.uploaded);
	});

	test("an empty batch is a no-op", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		const refs = await withStorageTransaction(
			depsOf(provider, logger),
			async (tx) => tx.uploadMany("media", []),
		);

		expect(refs).toEqual([]);
		expect(calls.uploaded).toEqual([]);
	});

	test("a batch at exactly maxCount is accepted", async () => {
		const { provider, calls } = createFakeProvider();
		const { logger } = createSpyLogger();

		await withStorageTransaction(
			depsOf(provider, logger, { maxCount: 2 }),
			async (tx) =>
				tx.uploadMany("media", [
					fileOf({ name: "a.png" }),
					fileOf({ name: "b.png" }),
				]),
		);

		expect(calls.uploaded).toHaveLength(2);
	});
});

/**
 * Reparto entre dos buckets.
 *
 * Es el punto de más riesgo del modo CDN: un mismo envío del panel sube fotos de
 * catálogo (bucket público) y documentos del expediente (bucket privado) dentro
 * de UNA transacción. Si el rollback borrara todo en un solo bucket, las fotos
 * quedarían huérfanas en el público sin que nada avisara.
 */
describe("withStorageTransaction — dos buckets", () => {
	const BUCKETS = { defaultBucket: "privado", publicBucket: "publico" };

	const createBucketAwareProvider = (options: { failAfter?: number } = {}) => {
		const uploaded: { bucket: string; key: string }[] = [];
		const deleted: { bucket: string; key: string }[] = [];

		const provider = {
			async uploadFile(bucket: string, key: string) {
				if (
					options.failAfter !== undefined &&
					uploaded.length >= options.failAfter
				) {
					throw new Error(`upload falló para ${key}`);
				}
				uploaded.push({ bucket, key });
			},
			async deleteFile(bucket: string, key: string) {
				deleted.push({ bucket, key });
			},
			getPublicUrl: (_bucket: string, key: string) =>
				`/api/storage?key=${encodeURIComponent(key)}`,
		} as unknown as IStorageProvider;

		return { provider, uploaded, deleted };
	};

	test("cada archivo se sube al bucket que le toca por su prefijo", async () => {
		const { provider, uploaded } = createBucketAwareProvider();
		const { logger } = createSpyLogger();

		await withStorageTransaction(
			{ provider, logger, buckets: BUCKETS },
			async (tx) => {
				await tx.upload("media", fileOf({ name: "foto.png" }));
				await tx.upload("documentos", fileOf({ name: "factura.pdf" }));
			},
		);

		expect(uploaded).toHaveLength(2);
		expect(uploaded[0].bucket).toBe("publico");
		expect(uploaded[0].key).toContain("media/");
		expect(uploaded[1].bucket).toBe("privado");
		expect(uploaded[1].key).toContain("documentos/");
	});

	// LA prueba que justifica el cambio: el rollback debe deshacer exactamente
	// donde escribió, bucket por bucket.
	test("el rollback borra cada key en SU bucket", async () => {
		const { provider, deleted } = createBucketAwareProvider();
		const { logger } = createSpyLogger();

		const boom = new Error("la escritura en base falló");

		await expect(
			withStorageTransaction(
				{ provider, logger, buckets: BUCKETS },
				async (tx) => {
					await tx.upload("media", fileOf({ name: "foto.png" }));
					await tx.upload("documentos", fileOf({ name: "factura.pdf" }));
					throw boom;
				},
			),
		).rejects.toBe(boom);

		expect(deleted).toHaveLength(2);
		const porBucket = Object.fromEntries(
			deleted.map((entry) => [entry.bucket, entry.key]),
		);
		expect(porBucket.publico).toContain("media/");
		expect(porBucket.privado).toContain("documentos/");
	});

	test("una subida fallida revierte lo ya subido en el otro bucket", async () => {
		const { provider, deleted } = createBucketAwareProvider({ failAfter: 1 });
		const { logger } = createSpyLogger();

		await expect(
			withStorageTransaction(
				{ provider, logger, buckets: BUCKETS },
				async (tx) => {
					await tx.upload("media", fileOf({ name: "foto.png" }));
					await tx.upload("documentos", fileOf({ name: "factura.pdf" }));
				},
			),
		).rejects.toThrow("upload falló");

		expect(deleted).toEqual([
			{ bucket: "publico", key: expect.stringContaining("media/") },
		]);
	});

	// Sin bucket público el reparto desaparece: todo cae en el de por defecto.
	// Es el modo de un solo bucket, y debe seguir comportándose igual que antes.
	test("sin bucket público todo se sube y se revierte en el mismo", async () => {
		const { provider, uploaded, deleted } = createBucketAwareProvider();
		const { logger } = createSpyLogger();

		const boom = new Error("fallo posterior");

		await expect(
			withStorageTransaction(
				{ provider, logger, buckets: { defaultBucket: "unico" } },
				async (tx) => {
					await tx.upload("media", fileOf({ name: "foto.png" }));
					await tx.upload("documentos", fileOf({ name: "factura.pdf" }));
					throw boom;
				},
			),
		).rejects.toBe(boom);

		expect(uploaded.every((entry) => entry.bucket === "unico")).toBe(true);
		expect(deleted.every((entry) => entry.bucket === "unico")).toBe(true);
	});
});
