import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { toProxyRef } from "@/shared/storage/public-url";
import type { SignRequest } from "@/shared/storage/url-signer.port";
import { LESSON_PLAYBACK_URL_POLICY } from "../../domain/content.config";
import { createLessonMaterialReader } from "../lesson-material.reader.server";

const createHarness = (storageBucket: string | null = "instituto") => {
	const batches: SignRequest[][] = [];
	const urlSigner = {
		signMany: async (requests: readonly SignRequest[]) => {
			batches.push([...requests]);
			return requests.map((request) => ({
				url: `https://bucket.example/${request.key}?${request.disposition}`,
				expiresAt: 0,
			}));
		},
	} as unknown as ICradle["urlSigner"];

	return {
		reader: createLessonMaterialReader({
			urlSigner,
			storageBucket,
			storagePublicBucket: null,
		}),
		batches,
	};
};

describe("createLessonMaterialReader", () => {
	test("firma para ver y para descargar con la política de reproducción", async () => {
		const { reader, batches } = createHarness();

		const signed = await reader.signReference(toProxyRef("documentos/a.pdf"));

		expect(signed).toEqual({
			fileUrl: "https://bucket.example/documentos/a.pdf?inline",
			downloadUrl: "https://bucket.example/documentos/a.pdf?attachment",
		});
		expect(batches[0].map((r) => r.policy)).toEqual([
			LESSON_PLAYBACK_URL_POLICY,
			LESSON_PLAYBACK_URL_POLICY,
		]);
	});

	test("varias referencias van en un solo lote", async () => {
		const { reader, batches } = createHarness();
		const refs = [
			toProxyRef("documentos/a.pdf"),
			toProxyRef("documentos/b.pdf"),
		];

		const signed = await reader.signReferences(refs);

		expect(batches).toHaveLength(1);
		expect(signed.get(refs[1])?.downloadUrl).toBe(
			"https://bucket.example/documentos/b.pdf?attachment",
		);
	});

	test("una referencia sin objeto queda en null y no se firma", async () => {
		const { reader, batches } = createHarness();

		const signed = await reader.signReferences(["https://otro.example/x"]);

		expect(signed.get("https://otro.example/x")).toBeNull();
		expect(batches).toEqual([]);
	});

	test("sin bucket configurado es un error de operación", async () => {
		const { reader } = createHarness(null);

		await expect(
			reader.signReference(toProxyRef("documentos/a.pdf")),
		).rejects.toThrow("STORAGE_BUCKET_NAME no configurado");
	});
});
