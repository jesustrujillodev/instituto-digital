import type { Logger } from "../logging/logger";
import { createThrottledLog } from "../logging/throttled-log";
import type { RedisConnections } from "../redis/redis.client.server";
import { REDIS_ERROR_LOG_INTERVAL_MS } from "../redis/redis.config";
import type { InvalidationBus } from "./invalidation-bus";
import { createMemoryInvalidationBus } from "./invalidation-bus.memory";
import { createRedisInvalidationBus } from "./invalidation-bus.redis.server";

export const createInvalidationBus = ({
	redis,
	logger,
}: {
	redis: RedisConnections | null;
	logger: Logger;
}): InvalidationBus =>
	redis
		? createRedisInvalidationBus({
				...redis,
				log: createThrottledLog(logger, {
					intervalMs: REDIS_ERROR_LOG_INTERVAL_MS,
				}),
			})
		: createMemoryInvalidationBus();
