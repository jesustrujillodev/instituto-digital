import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import type { ThrottledLog } from "../../logging/throttled-log";
import {
	cachePayloadKey,
	cacheVersionKey,
} from "../../redis/redis.keys.server";
import type { CachedRead } from "../versioned-cache";
import { createRedisVersionedCache } from "../versioned-cache.redis.server";

let instance = 0;

const READ: CachedRead<{ total: number }[]> = {
	name: "resumen",
	key: "2026",
	dependsOn: ["credits", "dependencies"],
	ttlS: 300,
	schema: v.array(v.object({ total: v.number() })),
};

const createHarness = () => {
	const redis = new RedisMock({
		keyPrefix: `vc${++instance}:`,
	}) as unknown as Redis;
	const warnings: string[] = [];
	const log = {
		warn: (_key: string, message: string) => warnings.push(message),
	} as unknown as ThrottledLog;
	let computed = 0;
	let total = 10;
	const compute = async () => {
		computed += 1;
		return [{ total }];
	};
	return {
		redis,
		warnings,
		cache: createRedisVersionedCache({ redis, log }),
		compute,
		computedTimes: () => computed,
		setTotal: (next: number) => {
			total = next;
		},
	};
};

describe("createRedisVersionedCache", () => {
	test("la segunda lectura sale de la caché", async () => {
		const { cache, compute, computedTimes } = createHarness();

		const first = await cache.getOrCompute(READ, compute);
		const second = await cache.getOrCompute(READ, compute);

		expect(second).toEqual(first);
		expect(computedTimes()).toBe(1);
	});

	test("invalidar cualquiera de sus alcances obliga a recalcular", async () => {
		const { cache, compute, computedTimes, setTotal } = createHarness();
		await cache.getOrCompute(READ, compute);

		setTotal(11);
		await cache.invalidate("dependencies");
		const after = await cache.getOrCompute(READ, compute);

		expect(after).toEqual([{ total: 11 }]);
		expect(computedTimes()).toBe(2);
	});

	test("invalidar otro alcance no la toca", async () => {
		const { cache, compute, computedTimes } = createHarness();
		await cache.getOrCompute(READ, compute);

		await cache.invalidate("users");
		await cache.getOrCompute(READ, compute);

		expect(computedTimes()).toBe(1);
	});

	// El punto del patrón: quien calculaba antes de la invalidación escribe un
	// valor que nadie volverá a aceptar.
	test("lo calculado durante una invalidación no se sirve después", async () => {
		const { cache, compute, computedTimes, setTotal } = createHarness();

		await cache.getOrCompute(READ, async () => {
			const stale = await compute();
			setTotal(11);
			await cache.invalidate("credits");
			return stale;
		});
		const after = await cache.getOrCompute(READ, compute);

		expect(after).toEqual([{ total: 11 }]);
		expect(computedTimes()).toBe(2);
	});

	// Si la versión desapareciera (expulsión por memoria) y el valor no, ese
	// valor no puede volver a parecer vigente.
	test("una versión perdida no resucita el valor viejo", async () => {
		const { redis, cache, compute, computedTimes } = createHarness();
		await cache.getOrCompute(READ, compute);

		await redis.del(cacheVersionKey("credits"));
		await cache.getOrCompute(READ, compute);

		expect(computedTimes()).toBe(2);
	});

	test("el valor caduca solo con su TTL", async () => {
		const { redis, cache, compute } = createHarness();

		await cache.getOrCompute(READ, compute);

		const ttl = await redis.ttl(cachePayloadKey(READ.name, READ.key));
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(READ.ttlS);
	});

	test("lo que no cumple el esquema se recalcula", async () => {
		const { cache, compute, computedTimes } = createHarness();
		await cache.getOrCompute(READ, compute);

		// La forma del valor cambió sin subir la versión del esquema.
		await cache.getOrCompute(
			{ ...READ, schema: v.array(v.object({ total: v.string() })) },
			async () => [{ total: String((await compute())[0].total) }],
		);

		expect(computedTimes()).toBe(2);
	});

	test("con Redis caído calcula y no lanza", async () => {
		const { redis, cache, compute, warnings } = createHarness();
		Object.assign(redis, {
			mget: () => Promise.reject(new Error("Connection is closed.")),
			set: () => Promise.reject(new Error("Connection is closed.")),
		});

		expect(await cache.getOrCompute(READ, compute)).toEqual([{ total: 10 }]);
		await expect(cache.invalidate("credits")).resolves.toBeUndefined();
		expect(warnings).toEqual([
			"versioned cache read failed",
			"versioned cache invalidation failed",
		]);
	});

	test("si no se puede escribir, responde igual con lo calculado", async () => {
		const { redis, cache, compute, warnings } = createHarness();
		Object.assign(redis, {
			set: () => Promise.reject(new Error("OOM")),
		});

		expect(await cache.getOrCompute(READ, compute)).toEqual([{ total: 10 }]);
		expect(warnings).toEqual(["versioned cache write failed"]);
	});
});
