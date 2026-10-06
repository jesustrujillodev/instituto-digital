import type { Redis } from "ioredis";
import type { Logger } from "../logging/logger";
import { createThrottledLog } from "../logging/throttled-log";
import { REDIS_ERROR_LOG_INTERVAL_MS } from "../redis/redis.config";
import type { VersionedCache } from "./versioned-cache";
import { createPassthroughVersionedCache } from "./versioned-cache.passthrough";
import { createRedisVersionedCache } from "./versioned-cache.redis.server";

export const createVersionedCache = ({
	redis,
	logger,
}: {
	redis: Redis | null;
	logger: Logger;
}): VersionedCache =>
	redis
		? createRedisVersionedCache({
				redis,
				log: createThrottledLog(logger, {
					intervalMs: REDIS_ERROR_LOG_INTERVAL_MS,
				}),
			})
		: createPassthroughVersionedCache();
