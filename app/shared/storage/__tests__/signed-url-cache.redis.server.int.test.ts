import { Redis } from "ioredis";
import { afterAll, describe, expect, test } from "vitest";
import { createRedisSignedUrlCache } from "../signed-url-cache.redis.server";

const redis = new Redis(process.env.REDIS_TEST_URL as string, {
	keyPrefix: `int${Date.now().toString(36)}:`,
});
const cache = createRedisSignedUrlCache({ redis });

describe("caché de URLs firmadas con Redis real", () => {
	afterAll(() => redis.quit());

	test("devuelve en orden lo guardado y null donde no hay", async () => {
		const value = { url: "https://storage/a?firma", expiresAt: 1_900_000_000 };

		await cache.setMany([{ key: "url:a", value, ttlMs: 60_000 }]);

		expect(await cache.getMany(["url:b", "url:a"])).toEqual([null, value]);
	});

	test("la entrada vence con su TTL", async () => {
		await cache.setMany([
			{
				key: "url:breve",
				value: { url: "https://storage/b", expiresAt: 1 },
				ttlMs: 100,
			},
		]);
		await new Promise((resolve) => setTimeout(resolve, 250));

		expect(await cache.getMany(["url:breve"])).toEqual([null]);
	});
});
