import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { describe, expect, test } from "vitest";
import { createRedisSignedUrlCache } from "../signed-url-cache.redis.server";

let instance = 0;

const createRedis = () =>
	new RedisMock({ keyPrefix: `su${++instance}:` }) as unknown as Redis;

const entryOf = (url: string) => ({ url, expiresAt: 1_800_000_000_000 });

describe("createRedisSignedUrlCache", () => {
	test("guarda y devuelve en el orden pedido, null en lo que falta", async () => {
		const cache = createRedisSignedUrlCache({ redis: createRedis() });

		await cache.setMany([
			{ key: "a", value: entryOf("A"), ttlMs: 60_000 },
			{ key: "b", value: entryOf("B"), ttlMs: 60_000 },
		]);

		expect(await cache.getMany(["b", "x", "a"])).toEqual([
			entryOf("B"),
			null,
			entryOf("A"),
		]);
	});

	test("cada entrada caduca sola con su TTL", async () => {
		const redis = createRedis();
		const cache = createRedisSignedUrlCache({ redis });

		await cache.setMany([{ key: "a", value: entryOf("A"), ttlMs: 60_000 }]);

		const ttl = await redis.pttl("a");
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(60_000);
	});

	// Un valor de otra versión o corrupto no rompe la página: se vuelve a firmar.
	test("lo que no tiene la forma esperada cuenta como ausente", async () => {
		const redis = createRedis();
		await redis.set("roto", "{no es json");
		await redis.set("otro", JSON.stringify({ url: 1 }));
		const cache = createRedisSignedUrlCache({ redis });

		expect(await cache.getMany(["roto", "otro"])).toEqual([null, null]);
	});

	test("sin claves no consulta", async () => {
		const redis = createRedis();
		Object.assign(redis, {
			mget: () => Promise.reject(new Error("no debió llamarse")),
		});
		const cache = createRedisSignedUrlCache({ redis });

		expect(await cache.getMany([])).toEqual([]);
		await expect(cache.setMany([])).resolves.toBeUndefined();
	});

	test("una escritura fallida se propaga para que quien firma la registre", async () => {
		const redis = createRedis();
		Object.assign(redis, {
			pipeline: () => ({
				set: () => {},
				exec: async () => [[new Error("OOM"), null]],
			}),
		});
		const cache = createRedisSignedUrlCache({ redis });

		await expect(
			cache.setMany([{ key: "a", value: entryOf("A"), ttlMs: 60_000 }]),
		).rejects.toThrow("OOM");
	});
});
