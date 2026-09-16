import { describe, expect, test } from "vitest";
import { collectObjects } from "../storage.listing";
import type {
	IStorageProvider,
	ListObjectsOptions,
	StorageObject,
} from "../storage.port";

const objectOf = (index: number): StorageObject => ({
	key: `media/unidad/foto-${index}.jpg`,
	size: 100,
	lastModified: null,
});

/** Proveedor falso que pagina `total` objetos en páginas de `pageSize`. */
const pagedProvider = (total: number, pageSize: number) => {
	const requests: ListObjectsOptions[] = [];
	const all = Array.from({ length: total }, (_, index) => objectOf(index));

	const provider = {
		listObjects: async (_bucket: string, options: ListObjectsOptions = {}) => {
			requests.push(options);
			const start = options.cursor ? Number(options.cursor) : 0;
			const size = Math.min(pageSize, options.limit ?? pageSize);
			const end = start + size;

			return {
				folders: [],
				objects: all.slice(start, end),
				nextCursor: end < total ? String(end) : null,
			};
		},
	} as unknown as IStorageProvider;

	return { provider, requests };
};

describe("collectObjects", () => {
	test("sigue el cursor hasta la última página", async () => {
		const { provider, requests } = pagedProvider(25, 10);

		const result = await collectObjects(provider, "b", "media/", {
			maxObjects: 100,
		});

		expect(result.objects).toHaveLength(25);
		expect(result.truncated).toBe(false);
		expect(requests.map((request) => request.cursor)).toEqual([
			null,
			"10",
			"20",
		]);
	});

	test("lista TODO el prefijo, sin delimitador", async () => {
		// Borrar o descargar una carpeta incluye sus subcarpetas.
		const { provider, requests } = pagedProvider(3, 10);

		await collectObjects(provider, "b", "media/", { maxObjects: 10 });

		expect(requests[0].delimiter).toBeUndefined();
		expect(requests[0].prefix).toBe("media/");
	});

	test("marca truncated al pasar del tope y no devuelve más de él", async () => {
		const { provider } = pagedProvider(50, 10);

		const result = await collectObjects(provider, "b", "media/", {
			maxObjects: 15,
		});

		expect(result.truncated).toBe(true);
		expect(result.objects).toHaveLength(15);
	});

	test("exactamente el tope NO es truncado", async () => {
		const { provider } = pagedProvider(15, 10);

		const result = await collectObjects(provider, "b", "media/", {
			maxObjects: 15,
		});

		expect(result.truncated).toBe(false);
		expect(result.objects).toHaveLength(15);
	});
});
