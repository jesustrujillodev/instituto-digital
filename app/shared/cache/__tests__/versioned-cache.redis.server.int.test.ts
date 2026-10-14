import { Redis } from "ioredis";
import * as v from "valibot";
import { afterAll, describe, expect, test } from "vitest";
import type { Logger } from "../../logging/logger";
import { createThrottledLog } from "../../logging/throttled-log";
import type { CachedRead } from "../versioned-cache";
import { createRedisVersionedCache } from "../versioned-cache.redis.server";

const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
} as unknown as Logger;
const log = createThrottledLog(silentLogger, { intervalMs: 60_000 });
const keyPrefix = `int${Date.now().toString(36)}:`;
const connections: Redis[] = [];

/** Cada nodo con su propia conexión, contra el mismo Redis. */
const node = () => {
	const redis = new Redis(process.env.REDIS_TEST_URL as string, { keyPrefix });
	connections.push(redis);
	return createRedisVersionedCache({ redis, log });
};

const read: CachedRead<{ total: number }> = {
	name: "dashboard",
	key: "dependencia-1",
	dependsOn: ["courses"],
	ttlS: 60,
	schema: v.object({ total: v.number() }),
};

describe("caché versionada con Redis real", () => {
	afterAll(() =>
		Promise.all(connections.map((connection) => connection.quit())),
	);

	test("un nodo reutiliza lo que calculó otro, e invalidar obliga a recalcular en todos", async () => {
		const left = node();
		const right = node();
		let computed = 0;
		const compute = async () => ({ total: ++computed });

		expect(await left.getOrCompute(read, compute)).toEqual({ total: 1 });
		expect(await right.getOrCompute(read, compute)).toEqual({ total: 1 });

		await left.invalidate("courses");

		expect(await right.getOrCompute(read, compute)).toEqual({ total: 2 });
		expect(computed).toBe(2);
	});
});
