import { describe, expect, test } from "vitest";
import { createMemorySignedUrlCache } from "../signed-url-cache.memory";

const entryOf = (url: string) => ({ url, expiresAt: 9_999_999 });

describe("createMemorySignedUrlCache", () => {
	test("devuelve lo guardado en el orden pedido y null en lo que falta", async () => {
		const cache = createMemorySignedUrlCache({ now: () => 0 });
		await cache.setMany([
			{ key: "a", value: entryOf("A"), ttlMs: 1_000 },
			{ key: "b", value: entryOf("B"), ttlMs: 1_000 },
		]);

		expect(await cache.getMany(["b", "x", "a"])).toEqual([
			entryOf("B"),
			null,
			entryOf("A"),
		]);
	});

	test("lo vencido cuenta como ausente", async () => {
		let now = 0;
		const cache = createMemorySignedUrlCache({ now: () => now });
		await cache.setMany([{ key: "a", value: entryOf("A"), ttlMs: 1_000 }]);

		now = 1_000;

		expect(await cache.getMany(["a"])).toEqual([null]);
	});

	// Con el tope alcanzado sale lo que nadie ha pedido en más tiempo.
	test("al pasar del tope descarta lo menos usado", async () => {
		const cache = createMemorySignedUrlCache({ maxEntries: 2, now: () => 0 });
		await cache.setMany([
			{ key: "a", value: entryOf("A"), ttlMs: 1_000 },
			{ key: "b", value: entryOf("B"), ttlMs: 1_000 },
		]);
		await cache.getMany(["a"]);

		await cache.setMany([{ key: "c", value: entryOf("C"), ttlMs: 1_000 }]);

		expect(await cache.getMany(["a", "b", "c"])).toEqual([
			entryOf("A"),
			null,
			entryOf("C"),
		]);
	});
});
