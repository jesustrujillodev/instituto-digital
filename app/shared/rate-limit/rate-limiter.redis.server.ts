import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { rateLimitKey } from "../redis/redis.keys.server";
import type { RateLimiter } from "./rate-limiter";
import { SLIDING_WINDOW_LUA } from "./rate-limiter.sliding-window.lua";

type SlidingWindowClient = Redis & {
	slidingWindow(
		key: string,
		windowMs: number,
		limit: number,
		nonce: string,
	): Promise<[number, number]>;
};

/**
 * Límite compartido entre nodos, en un solo viaje (EVALSHA del script).
 *
 * Lanza si Redis no responde: el puerto promete no lanzar, así que este
 * adaptador solo se registra envuelto en `createFallbackRateLimiter`.
 */
export const createRedisRateLimiter = ({
	redis,
	nonce = randomUUID,
}: {
	redis: Redis;
	nonce?: () => string;
}): RateLimiter => {
	redis.defineCommand("slidingWindow", {
		numberOfKeys: 1,
		lua: SLIDING_WINDOW_LUA,
	});
	const client = redis as SlidingWindowClient;

	return {
		async consume(key, { limit, windowMs }) {
			const [allowed, retryAfterMs] = await client.slidingWindow(
				rateLimitKey(key),
				windowMs,
				limit,
				nonce(),
			);
			return { allowed: allowed === 1, retryAfterMs };
		},
	};
};
