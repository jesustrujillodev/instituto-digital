import { describe, expect, test } from "vitest";
import { createDeleteObjectJob } from "../delete-object.job.server";
import type {
	IObjectReferenceSource,
	ObjectReference,
} from "../object-reference.port";
import type { IStorageProvider } from "../storage.port";

const providerOf = (
	options: { deleteFails?: boolean; exists?: boolean },
	deleted: string[] = [],
) =>
	({
		deleteFile: async (_bucket: string, key: string) => {
			if (options.deleteFails) throw new Error("404 No such object");
			deleted.push(key);
		},
		fileExists: async () => options.exists ?? false,
	}) as unknown as IStorageProvider;

const sourceOf = (
	references: ObjectReference[] = [],
	lookups: (readonly string[])[] = [],
) =>
	({
		findByKeys: async (keys: readonly string[]) => {
			lookups.push(keys);
			return references;
		},
	}) as unknown as IObjectReferenceSource;

const OBJECT = { bucket: "instituto", key: "cursos/portada.png" };

describe("createDeleteObjectJob", () => {
	test("borra el objeto", async () => {
		const deleted: string[] = [];

		await expect(
			createDeleteObjectJob(providerOf({}, deleted), [sourceOf()])(OBJECT),
		).resolves.toBeUndefined();
		expect(deleted).toEqual([OBJECT.key]);
	});

	// GCS responde 404 al borrar lo que ya no está: eso es un borrado hecho.
	test("si ya no existe, cuenta como borrado", async () => {
		await expect(
			createDeleteObjectJob(providerOf({ deleteFails: true }), [sourceOf()])(
				OBJECT,
			),
		).resolves.toBeUndefined();
	});

	test("si falla y el objeto sigue ahí, lanza para reintentar", async () => {
		await expect(
			createDeleteObjectJob(providerOf({ deleteFails: true, exists: true }), [
				sourceOf(),
			])(OBJECT),
		).rejects.toThrow("404 No such object");
	});

	// C04 y C05: la fila que soltó el objeto no era la única que lo usaba.
	test("un objeto que otra fila sigue usando no se borra", async () => {
		const deleted: string[] = [];
		const lookups: (readonly string[])[] = [];

		await createDeleteObjectJob(providerOf({}, deleted), [
			sourceOf([], lookups),
			sourceOf(
				[{ key: OBJECT.key, owner: "lesson", label: "Marco legal" }],
				lookups,
			),
		])(OBJECT);

		expect(deleted).toEqual([]);
		expect(lookups).toEqual([[OBJECT.key], [OBJECT.key]]);
	});
});
