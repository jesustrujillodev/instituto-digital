import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Logger } from "@/shared/logging/logger";

// Se sustituye el SDK: lo que se prueba es la TRADUCCIÓN entre el puerto y los
// comandos de S3 (qué se envía y cómo se lee la respuesta), no la red.
const send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
	const command = (name: string) =>
		class {
			readonly __name = name;
			constructor(readonly input: Record<string, unknown>) {}
		};

	return {
		S3Client: class {
			send = send;
		},
		CreateBucketCommand: command("CreateBucket"),
		DeleteObjectCommand: command("DeleteObject"),
		DeleteObjectsCommand: command("DeleteObjects"),
		GetObjectCommand: command("GetObject"),
		HeadObjectCommand: command("HeadObject"),
		ListObjectsV2Command: command("ListObjectsV2"),
		PutObjectCommand: command("PutObject"),
	};
});

const getSignedUrl = vi.fn(async () => "https://firmada");
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

const { createS3StorageProvider } = await import("../s3.adapter");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const provider = () => createS3StorageProvider({}, silentLogger);

type SentCommand = { __name: string; input: Record<string, unknown> };
const sentAt = (index: number) => send.mock.calls[index][0] as SentCommand;

beforeEach(() => {
	send.mockReset();
	getSignedUrl.mockClear();
});

describe("listObjects", () => {
	test("envía prefijo, delimitador, cursor y tope tal cual", async () => {
		send.mockResolvedValue({});

		await provider().listObjects("b", {
			prefix: "media/",
			delimiter: "/",
			cursor: "token-1",
			limit: 50,
		});

		expect(sentAt(0).input).toMatchObject({
			Bucket: "b",
			Prefix: "media/",
			Delimiter: "/",
			ContinuationToken: "token-1",
			MaxKeys: 50,
		});
	});

	test("nunca pide más de 1000 por página", async () => {
		send.mockResolvedValue({});

		await provider().listObjects("b", { limit: 5000 });

		expect(sentAt(0).input.MaxKeys).toBe(1000);
	});

	test("traduce carpetas, objetos y cursor", async () => {
		const modified = new Date("2026-09-01T00:00:00Z");
		send.mockResolvedValue({
			CommonPrefixes: [{ Prefix: "media/cursos/" }],
			Contents: [
				{ Key: "media/a.jpg", Size: 10, LastModified: modified },
				// Marcador de carpeta vacío: no es un archivo.
				{ Key: "media/", Size: 0 },
			],
			IsTruncated: true,
			NextContinuationToken: "token-2",
		});

		const result = await provider().listObjects("b", { prefix: "media/" });

		expect(result).toEqual({
			folders: ["media/cursos/"],
			objects: [{ key: "media/a.jpg", size: 10, lastModified: modified }],
			nextCursor: "token-2",
		});
	});

	test("sin IsTruncated no hay cursor aunque venga un token", async () => {
		send.mockResolvedValue({ NextContinuationToken: "x" });

		const result = await provider().listObjects("b");

		expect(result.nextCursor).toBeNull();
	});
});

describe("deleteFiles", () => {
	test("parte en lotes de 1000", async () => {
		send.mockResolvedValue({});
		const keys = Array.from({ length: 1500 }, (_, index) => `k/${index}`);

		const result = await provider().deleteFiles("b", keys);

		expect(send).toHaveBeenCalledTimes(2);
		const firstBatch = sentAt(0).input.Delete as { Objects: unknown[] };
		expect(firstBatch.Objects).toHaveLength(1000);
		expect(result.deleted).toHaveLength(1500);
	});

	test("reporta las keys que el proveedor no pudo borrar sin lanzar", async () => {
		send.mockResolvedValue({
			Errors: [{ Key: "k/2", Code: "AccessDenied", Message: "denegado" }],
		});

		const result = await provider().deleteFiles("b", ["k/1", "k/2"]);

		expect(result.deleted).toEqual(["k/1"]);
		expect(result.failed).toEqual([{ key: "k/2", error: "denegado" }]);
	});

	test("un fallo de la petición entera marca todo su lote", async () => {
		send.mockRejectedValue(new Error("red caída"));

		const result = await provider().deleteFiles("b", ["k/1", "k/2"]);

		expect(result.deleted).toEqual([]);
		expect(result.failed.map((entry) => entry.key)).toEqual(["k/1", "k/2"]);
	});
});

describe("getPresignedUrl", () => {
	const dispositionSent = () =>
		(getSignedUrl.mock.calls.at(-1) as unknown as [unknown, SentCommand])[1]
			.input.ResponseContentDisposition;

	test("es inline por defecto", async () => {
		await provider().getPresignedUrl("b", "media/a.jpg", 60);

		expect(dispositionSent()).toBe('inline; filename="a.jpg"');
	});

	test("attachment fuerza la descarga con el nombre saneado", async () => {
		await provider().getPresignedUrl("b", 'docs/fac"tura.pdf', 60, {
			disposition: "attachment",
		});

		expect(dispositionSent()).toBe('attachment; filename="fac_tura.pdf"');
	});
});

describe("getUploadUrl", () => {
	test("firma un PutObject con el tipo, y NADA más", async () => {
		await provider().getUploadUrl("b", "media/lecciones/clase-1.mp4", {
			contentType: "video/mp4",
			expiresInSeconds: 900,
		});

		const [, command, options] = getSignedUrl.mock.calls[0] as unknown as [
			unknown,
			SentCommand,
			{ expiresIn: number },
		];

		expect(command.__name).toBe("PutObject");
		expect(command.input).toEqual({
			Bucket: "b",
			Key: "media/lecciones/clase-1.mp4",
			ContentType: "video/mp4",
		});
		// Cada cabecera firmada es una que el navegador está OBLIGADO a mandar:
		// firmar `Cache-Control` rompería la subida con un 403 por firma.
		expect(options.expiresIn).toBe(900);
	});
});

describe("statObject", () => {
	test("devuelve el tamaño que confirma la subida", async () => {
		const lastModified = new Date("2026-09-22T12:00:00.000Z");
		send.mockResolvedValue({ ContentLength: 2048, LastModified: lastModified });

		expect(
			await provider().statObject("b", "documentos/lecciones/m.pdf"),
		).toEqual({ key: "documentos/lecciones/m.pdf", size: 2048, lastModified });
		expect(sentAt(0).__name).toBe("HeadObject");
	});

	test("un objeto que no está devuelve null, no lanza", async () => {
		send.mockRejectedValue({ name: "NotFound" });

		expect(
			await provider().statObject("b", "documentos/lecciones/no.pdf"),
		).toBe(null);
	});
});
