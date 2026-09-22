import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Logger } from "@/shared/logging/logger";

// Mismo criterio que el test de S3: se prueba la traducción puerto ↔ librería.
const getFiles = vi.fn();
const deleteObject = vi.fn();
const getSignedUrl = vi.fn(async () => ["https://firmada"]);
const getMetadata = vi.fn(async () => [{ size: "2048", updated: undefined }]);

vi.mock("@google-cloud/storage", () => ({
	Storage: class {
		bucket() {
			return {
				getFiles,
				file: (name: string) => ({
					delete: (options: unknown) => deleteObject(name, options),
					getSignedUrl,
					getMetadata,
				}),
			};
		}
	},
}));

const { createGcsStorageProvider } = await import("../gcs.adapter");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const provider = () => createGcsStorageProvider({}, silentLogger);

beforeEach(() => {
	getFiles.mockReset();
	deleteObject.mockReset();
	getSignedUrl.mockClear();
	getMetadata.mockClear();
});

describe("listObjects", () => {
	test("envía el prefijo CRUDO y pide una sola página", async () => {
		getFiles.mockResolvedValue([[], null, {}]);

		await provider().listObjects("b", {
			prefix: "media/",
			delimiter: "/",
			cursor: "p2",
			limit: 20,
		});

		expect(getFiles).toHaveBeenCalledWith({
			prefix: "media/",
			delimiter: "/",
			pageToken: "p2",
			maxResults: 20,
			autoPaginate: false,
		});
	});

	test("traduce archivos, prefijos y siguiente página", async () => {
		getFiles.mockResolvedValue([
			[
				{
					name: "media/a.jpg",
					metadata: { size: "42", updated: "2026-09-01T00:00:00Z" },
				},
				{ name: "media/", metadata: {} },
			],
			{ pageToken: "p3" },
			{ prefixes: ["media/cursos/"] },
		]);

		const result = await provider().listObjects("b", { prefix: "media/" });

		expect(result).toEqual({
			folders: ["media/cursos/"],
			objects: [
				{
					key: "media/a.jpg",
					size: 42,
					lastModified: new Date("2026-09-01T00:00:00Z"),
				},
			],
			nextCursor: "p3",
		});
	});
});

describe("deleteFiles", () => {
	test("separa lo borrado de lo fallido sin lanzar", async () => {
		deleteObject.mockImplementation(async (name: string) => {
			if (name === "k/2") throw new Error("403");
		});

		const result = await provider().deleteFiles("b", ["k/1", "k/2"]);

		expect(result.deleted).toEqual(["k/1"]);
		expect(result.failed).toEqual([{ key: "k/2", error: "Error: 403" }]);
	});

	test("un objeto que ya no existe cuenta como borrado", async () => {
		deleteObject.mockResolvedValue(undefined);

		await provider().deleteFiles("b", ["k/1"]);

		expect(deleteObject).toHaveBeenCalledWith("k/1", { ignoreNotFound: true });
	});
});

describe("getPresignedUrl", () => {
	test("propaga la disposición pedida", async () => {
		await provider().getPresignedUrl("b", "docs/factura.pdf", 60, {
			disposition: "attachment",
		});

		expect(getSignedUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				responseDisposition: 'attachment; filename="factura.pdf"',
			}),
		);
	});
});

describe("getUploadUrl", () => {
	test("firma una escritura v4 con el tipo declarado", async () => {
		await provider().getUploadUrl("b", "documentos/lecciones/m.pdf", {
			contentType: "application/pdf",
			expiresInSeconds: 900,
		});

		const [options] = getSignedUrl.mock.calls.at(-1) as unknown as [
			{ version: string; action: string; contentType: string },
		];

		expect(options).toMatchObject({
			version: "v4",
			action: "write",
			contentType: "application/pdf",
		});
	});
});

describe("statObject", () => {
	test("el tamaño llega como número aunque el SDK lo dé en texto", async () => {
		expect(
			await provider().statObject("b", "documentos/lecciones/m.pdf"),
		).toEqual({
			key: "documentos/lecciones/m.pdf",
			size: 2048,
			lastModified: null,
		});
	});

	test("un objeto que no está devuelve null, no lanza", async () => {
		getMetadata.mockRejectedValueOnce({ code: 404 });

		expect(
			await provider().statObject("b", "documentos/lecciones/no.pdf"),
		).toBe(null);
	});
});
