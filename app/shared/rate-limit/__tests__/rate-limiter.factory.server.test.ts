import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { describe, expect, test } from "vitest";
import type { Logger } from "../../logging/logger";
import { createRateLimiter } from "../rate-limiter.factory.server";

const OPTS = { limit: 1, windowMs: 60_000 };

const createLogger = () => {
	const warnings: string[] = [];
	const logger = {
		warn: (message: string) => warnings.push(message),
	} as unknown as Logger;
	return { logger, warnings };
};

describe("createRateLimiter", () => {
	test("sin Redis limita en memoria", async () => {
		const limiter = createRateLimiter({
			redis: null,
			logger: createLogger().logger,
		});

		expect((await limiter.consume("k", OPTS)).allowed).toBe(true);
		expect((await limiter.consume("k", OPTS)).allowed).toBe(false);
	});

	// Dos procesos con el mismo Redis: el segundo ve lo que contó el primero.
	test("con Redis el límite se comparte entre instancias", async () => {
		const options = { keyPrefix: "factory-shared:" };
		const nodeA = createRateLimiter({
			redis: new RedisMock(options) as unknown as Redis,
			logger: createLogger().logger,
		});
		const nodeB = createRateLimiter({
			redis: new RedisMock(options) as unknown as Redis,
			logger: createLogger().logger,
		});

		await nodeA.consume("auth:login:email:ana@instituto.gob.mx", OPTS);

		expect(
			(await nodeB.consume("auth:login:email:ana@instituto.gob.mx", OPTS))
				.allowed,
		).toBe(false);
	});

	test("con Redis caído sigue limitando en memoria", async () => {
		const redis = new RedisMock({
			keyPrefix: "factory-down:",
		}) as unknown as Redis;
		const { logger, warnings } = createLogger();
		const limiter = createRateLimiter({ redis, logger });
		// ioredis-mock no simula caídas: se sustituye el comando por uno que rechaza.
		Object.assign(redis, {
			slidingWindow: () => Promise.reject(new Error("Connection is closed.")),
		});

		expect((await limiter.consume("k", OPTS)).allowed).toBe(true);
		expect((await limiter.consume("k", OPTS)).allowed).toBe(false);
		expect(warnings).toHaveLength(1);
	});
});
