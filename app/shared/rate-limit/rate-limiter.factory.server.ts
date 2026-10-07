import type { Redis } from "ioredis";
import type { Logger } from "../logging/logger";
import { createThrottledLog } from "../logging/throttled-log";
import { REDIS_ERROR_LOG_INTERVAL_MS } from "../redis/redis.config";
import type { RateLimiter } from "./rate-limiter";
import { createFallbackRateLimiter } from "./rate-limiter.fallback";
import { createMemoryRateLimiter } from "./rate-limiter.memory";
import { createRedisRateLimiter } from "./rate-limiter.redis.server";

/** Sin Redis, el de memoria; con Redis, el compartido con respaldo en memoria. */
export const createRateLimiter = ({
	redis,
	logger,
}: {
	redis: Redis | null;
	logger: Logger;
}): RateLimiter => {
	if (!redis) return createMemoryRateLimiter();

	return createFallbackRateLimiter({
		primary: createRedisRateLimiter({ redis }),
		fallback: createMemoryRateLimiter(),
		log: createThrottledLog(logger, {
			intervalMs: REDIS_ERROR_LOG_INTERVAL_MS,
		}),
	});
};
