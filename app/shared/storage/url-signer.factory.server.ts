import type { Redis } from "ioredis";
import type { Logger } from "../logging/logger";
import { createThrottledLog } from "../logging/throttled-log";
import { REDIS_ERROR_LOG_INTERVAL_MS } from "../redis/redis.config";
import { createMemorySignedUrlCache } from "./signed-url-cache.memory";
import { createRedisSignedUrlCache } from "./signed-url-cache.redis.server";
import type { IStorageProvider } from "./storage.port";
import type { UrlSigner } from "./url-signer.port";
import { createUrlSigner } from "./url-signer.server";

/** Con Redis la URL se reutiliza entre nodos; sin él, dentro del proceso. */
export const createUrlSignerFromEnv = ({
	redis,
	storageProvider,
	logger,
}: {
	redis: Redis | null;
	storageProvider: IStorageProvider;
	logger: Logger;
}): UrlSigner =>
	createUrlSigner({
		storageProvider,
		cache: redis
			? createRedisSignedUrlCache({ redis })
			: createMemorySignedUrlCache(),
		log: createThrottledLog(logger, {
			intervalMs: REDIS_ERROR_LOG_INTERVAL_MS,
		}),
	});
