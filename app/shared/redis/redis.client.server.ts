import { Redis } from "ioredis";
import type { Env } from "@/core/env.server";
import type { Logger } from "../logging/logger";
import { createThrottledLog } from "../logging/throttled-log";
import {
	REDIS_COMMAND_TIMEOUT_MS,
	REDIS_CONNECT_TIMEOUT_MS,
	REDIS_ERROR_LOG_INTERVAL_MS,
	REDIS_MAX_RETRIES_PER_REQUEST,
} from "./redis.config";
import { reconnectDelayMs } from "./redis.retry";

export interface RedisConnections {
	/** Comandos normales. Falla rápido si no hay conexión: nunca encola. */
	command: Redis;
	/** Solo pub/sub: una conexión suscrita no admite otros comandos. */
	subscriber: Redis;
	keyPrefix: string;
}

const REDIS_GLOBAL = Symbol.for("instituto-digital.redis");

type GlobalWithRedis = typeof globalThis & {
	[REDIS_GLOBAL]?: RedisConnections;
};

const connect = (
	url: string,
	keyPrefix: string,
	logger: Logger,
): RedisConnections => {
	const log = createThrottledLog(logger, {
		intervalMs: REDIS_ERROR_LOG_INTERVAL_MS,
	});

	const command = new Redis(url, {
		keyPrefix,
		// La red privada de Railway resuelve por IPv6.
		family: 0,
		connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
		commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
		maxRetriesPerRequest: REDIS_MAX_RETRIES_PER_REQUEST,
		// Desconectado, un comando falla al instante y su llamador toma el camino
		// sin Redis, en vez de esperar a que vuelva.
		enableOfflineQueue: false,
		retryStrategy: (attempt) => reconnectDelayMs(attempt),
	});
	// La suscripción se pide antes de `ready`: esta conexión sí necesita su cola.
	const subscriber = command.duplicate({
		enableOfflineQueue: true,
		commandTimeout: undefined,
	});

	// Sin listener de `error`, un fallo de conexión tumbaría el proceso.
	for (const [name, connection] of [
		["command", command],
		["subscriber", subscriber],
	] as const) {
		connection.on("error", (error: Error) =>
			log.warn(`redis:${name}`, "redis unavailable", {
				connection: name,
				message: error.message,
			}),
		);
		connection.on("ready", () =>
			logger.info("redis ready", { connection: name }),
		);
	}

	return { command, subscriber, keyPrefix };
};

/**
 * Las dos conexiones del proceso, o `null` sin `REDIS_URL`. En desarrollo se
 * reutilizan entre recargas en caliente, como el cliente de Prisma.
 */
export const createRedisConnectionsFromEnv = (
	env: Pick<Env, "REDIS_URL" | "REDIS_KEY_PREFIX" | "NODE_ENV">,
	logger: Logger,
): RedisConnections | null => {
	if (!env.REDIS_URL) {
		logger.info("redis disabled: using per-process adapters");
		return null;
	}

	const globalWithRedis = globalThis as GlobalWithRedis;
	const connections =
		globalWithRedis[REDIS_GLOBAL] ??
		connect(env.REDIS_URL, env.REDIS_KEY_PREFIX, logger);
	if (env.NODE_ENV !== "production") {
		globalWithRedis[REDIS_GLOBAL] = connections;
	}
	return connections;
};
