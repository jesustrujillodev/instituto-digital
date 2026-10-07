import { Redis as IORedis, type Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { afterAll, describe, expect, test } from "vitest";
import { rateLimitKey } from "../../redis/redis.keys.server";
import { createRedisRateLimiter } from "../rate-limiter.redis.server";
import { describeRateLimiterContract } from "./rate-limiter.contract";

let instance = 0;

// Las instancias de ioredis-mock comparten datos: un prefijo propio aísla cada prueba.
const createRedis = () =>
	new RedisMock({ keyPrefix: `t${++instance}:` }) as unknown as Redis;

/** ioredis-mock no simula caídas: se sustituye el comando por uno que rechaza. */
const breakScript = (redis: Redis) => {
	Object.assign(redis, {
		slidingWindow: () => Promise.reject(new Error("Connection is closed.")),
	});
};

describeRateLimiterContract("createRedisRateLimiter", () =>
	createRedisRateLimiter({ redis: createRedis() }),
);

describe("createRedisRateLimiter", () => {
	const OPTS = { limit: 3, windowMs: 60_000 };

	// Si el rechazo contara, quien insiste nunca saldría del bloqueo.
	test("un intento rechazado no se registra en la ventana", async () => {
		const redis = createRedis();
		const limiter = createRedisRateLimiter({ redis });

		for (let i = 0; i < OPTS.limit + 5; i++) {
			await limiter.consume("auth:login:ip:10.0.0.1", OPTS);
		}

		expect(await redis.zcard(rateLimitKey("auth:login:ip:10.0.0.1"))).toBe(
			OPTS.limit,
		);
	});

	test("la ventana caduca sola con su propia duración", async () => {
		const redis = createRedis();
		const limiter = createRedisRateLimiter({ redis });

		await limiter.consume("check-in:10.0.0.1", OPTS);

		const ttl = await redis.pttl(rateLimitKey("check-in:10.0.0.1"));
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(OPTS.windowMs);
	});

	test("el email no se guarda en claro", async () => {
		const redis = createRedis();
		const limiter = createRedisRateLimiter({ redis });

		await limiter.consume("auth:login:email:ana@instituto.gob.mx", OPTS);

		const keys = await redis.keys("*");
		expect(keys).toHaveLength(1);
		expect(keys[0]).not.toContain("ana@instituto.gob.mx");
	});

	// Dos intentos en el mismo milisegundo son dos miembros, no uno.
	test("intentos simultáneos cuentan por separado", async () => {
		const limiter = createRedisRateLimiter({ redis: createRedis() });

		const decisions = await Promise.all(
			Array.from({ length: OPTS.limit + 1 }, () => limiter.consume("k", OPTS)),
		);

		expect(decisions.filter((d) => d.allowed)).toHaveLength(OPTS.limit);
	});

	test("lanza si Redis no responde", async () => {
		const redis = createRedis();
		const limiter = createRedisRateLimiter({ redis });
		breakScript(redis);

		await expect(limiter.consume("k", OPTS)).rejects.toThrow();
	});
});

// Contra un Redis de verdad (`docker compose up -d redis`): confirma que el
// script corre igual fuera del simulador. Se omite si no hay REDIS_TEST_URL.
describe.runIf(process.env.REDIS_TEST_URL)("contra Redis real", () => {
	describeRateLimiterContract("createRedisRateLimiter (real)", () => {
		const redis = new IORedis(process.env.REDIS_TEST_URL as string, {
			keyPrefix: `test:${Date.now()}:${++instance}:`,
			lazyConnect: false,
		});
		afterAll(() => redis.quit());
		return createRedisRateLimiter({ redis });
	});
});
