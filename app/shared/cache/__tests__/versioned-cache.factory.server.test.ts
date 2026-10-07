import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import type { Logger } from "../../logging/logger";
import { createVersionedCache } from "../versioned-cache.factory.server";

const logger = { warn: () => {}, info: () => {} } as unknown as Logger;

const READ = {
	name: "resumen",
	key: "2026",
	dependsOn: ["credits"],
	ttlS: 300,
	schema: v.number(),
};

describe("createVersionedCache", () => {
	test("sin Redis no cachea", async () => {
		const cache = createVersionedCache({ redis: null, logger });
		let computed = 0;

		await cache.getOrCompute(READ, async () => ++computed);
		await cache.getOrCompute(READ, async () => ++computed);

		expect(computed).toBe(2);
	});

	test("con Redis cachea", async () => {
		const redis = new RedisMock({ keyPrefix: "vcf:" }) as unknown as Redis;
		const cache = createVersionedCache({ redis, logger });
		let computed = 0;

		await cache.getOrCompute(READ, async () => ++computed);
		await cache.getOrCompute(READ, async () => ++computed);

		expect(computed).toBe(1);
	});
});
