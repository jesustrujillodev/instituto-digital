import { afterAll, describe, expect, test } from "vitest";
import { env } from "@/core/env.server";
import type { Logger } from "@/shared/logging/logger";
import { createStorageProviderFromEnv } from "../storage.factory";

const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
} as unknown as Logger;

const storage = createStorageProviderFromEnv(env, silentLogger);
const bucket = env.STORAGE_BUCKET_NAME as string;
const publicBucket = env.STORAGE_PUBLIC_BUCKET_NAME as string;
const prefix = `int-${Date.now().toString(36)}/`;

describe("adaptador S3 contra MinIO", () => {
	afterAll(async () => {
		const { objects } = await storage.listObjects(bucket, { prefix });
		await storage.deleteFiles(
			bucket,
			objects.map((object) => object.key),
		);
	});

	test("sube, lee, describe y borra un objeto", async () => {
		const key = `${prefix}documentos/acta.txt`;

		await storage.uploadFile(bucket, key, "contenido", "text/plain");

		expect((await storage.getFile(bucket, key)).toString()).toBe("contenido");
		expect(await storage.statObject(bucket, key)).toMatchObject({
			key,
			size: 9,
			contentType: "text/plain",
		});
		expect(await storage.fileExists(bucket, key)).toBe(true);

		await storage.deleteFile(bucket, key);

		expect(await storage.fileExists(bucket, key)).toBe(false);
		expect(await storage.statObject(bucket, key)).toBeNull();
	});

	test("la URL de subida firmada acepta el tipo firmado y rechaza otro", async () => {
		const key = `${prefix}media/foto.png`;
		const url = await storage.getUploadUrl(bucket, key, {
			contentType: "image/png",
		});

		const rejected = await fetch(url, {
			method: "PUT",
			headers: { "Content-Type": "image/jpeg" },
			body: new Uint8Array([1, 2, 3]),
		});
		expect(rejected.ok).toBe(false);

		const accepted = await fetch(url, {
			method: "PUT",
			headers: { "Content-Type": "image/png" },
			body: new Uint8Array([1, 2, 3]),
		});
		expect(accepted.status).toBe(200);
		expect(await storage.statObject(bucket, key)).toMatchObject({
			size: 3,
			contentType: "image/png",
		});
	});

	test("la URL de lectura firmada sirve el objeto con su disposición", async () => {
		const key = `${prefix}documentos/constancia.pdf`;
		await storage.uploadFile(bucket, key, "%PDF-1.7", "application/pdf");

		const url = await storage.getPresignedUrl(bucket, key, 60, {
			disposition: "attachment",
		});
		const response = await fetch(url);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("%PDF-1.7");
		expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
	});

	test("lista por carpetas con delimitador y pagina con cursor", async () => {
		await Promise.all(
			["a.txt", "b.txt", "c.txt", "sub/d.txt"].map((name) =>
				storage.uploadFile(bucket, `${prefix}lista/${name}`, name),
			),
		);

		const firstPage = await storage.listObjects(bucket, {
			prefix: `${prefix}lista/`,
			delimiter: "/",
			limit: 2,
		});
		expect(firstPage.objects).toHaveLength(2);
		expect(firstPage.nextCursor).not.toBeNull();

		const secondPage = await storage.listObjects(bucket, {
			prefix: `${prefix}lista/`,
			delimiter: "/",
			limit: 2,
			cursor: firstPage.nextCursor,
		});
		const keys = [...firstPage.objects, ...secondPage.objects].map(
			(object) => object.key,
		);
		const folders = [...firstPage.folders, ...secondPage.folders];

		expect(keys).toEqual([
			`${prefix}lista/a.txt`,
			`${prefix}lista/b.txt`,
			`${prefix}lista/c.txt`,
		]);
		expect(folders).toEqual([`${prefix}lista/sub/`]);
	});

	test("el borrado en lote informa lo borrado", async () => {
		const keys = [`${prefix}lote/1.txt`, `${prefix}lote/2.txt`];
		await Promise.all(keys.map((key) => storage.uploadFile(bucket, key, "x")));

		const result = await storage.deleteFiles(bucket, keys);

		expect([...result.deleted].sort()).toEqual(keys);
		expect(result.failed).toEqual([]);
	});

	test("el bucket público no ve lo que vive en el privado", async () => {
		const key = `${prefix}documentos/privado.txt`;
		await storage.uploadFile(bucket, key, "privado");

		expect(await storage.fileExists(publicBucket, key)).toBe(false);
	});
});
