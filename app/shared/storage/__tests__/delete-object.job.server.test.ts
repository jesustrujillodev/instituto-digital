import { describe, expect, test } from "vitest";
import { createDeleteObjectJob } from "../delete-object.job.server";
import type { IStorageProvider } from "../storage.port";

const providerOf = (options: { deleteFails?: boolean; exists?: boolean }) =>
	({
		deleteFile: async () => {
			if (options.deleteFails) throw new Error("404 No such object");
		},
		fileExists: async () => options.exists ?? false,
	}) as unknown as IStorageProvider;

const OBJECT = { bucket: "instituto", key: "cursos/portada.png" };

describe("createDeleteObjectJob", () => {
	test("borra el objeto", async () => {
		await expect(
			createDeleteObjectJob(providerOf({}))(OBJECT),
		).resolves.toBeUndefined();
	});

	// GCS responde 404 al borrar lo que ya no está: eso es un borrado hecho.
	test("si ya no existe, cuenta como borrado", async () => {
		await expect(
			createDeleteObjectJob(providerOf({ deleteFails: true }))(OBJECT),
		).resolves.toBeUndefined();
	});

	test("si falla y el objeto sigue ahí, lanza para reintentar", async () => {
		await expect(
			createDeleteObjectJob(providerOf({ deleteFails: true, exists: true }))(
				OBJECT,
			),
		).rejects.toThrow("404 No such object");
	});
});
