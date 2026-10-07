import { Queue } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";
import type { Env } from "@/core/env.server";
import type { Logger } from "../logging/logger";
import {
	createThrottledLog,
	type ThrottledLog,
} from "../logging/throttled-log";
import {
	REDIS_CONNECT_TIMEOUT_MS,
	REDIS_ERROR_LOG_INTERVAL_MS,
} from "../redis/redis.config";
import { reconnectDelayMs } from "../redis/redis.retry";
import type { JobQueues } from "./job-dispatcher";
import {
	QUEUE_DEFAULTS,
	QUEUE_OF,
	QUEUE_PREFIX_SUFFIX,
	type QueueName,
} from "./queue.config";
import { jobAddOptions } from "./queue.job-options";

/** Encolar va en el camino de una petición: no espera a un Redis lento. */
const QUEUE_ADD_TIMEOUT_MS = 1_000;

export type QueueRole = "producer" | "worker";

export const queuePrefixOf = (keyPrefix: string) =>
	`${keyPrefix}${QUEUE_PREFIX_SUFFIX}`;

/**
 * BullMQ duplica la conexión para sus comandos bloqueantes. Sin listener de
 * `error` en cada copia, un corte de Redis tumba el proceso; por eso también
 * se envuelven las copias de las copias.
 */
const guardConnection = (
	connection: Redis,
	role: QueueRole,
	log: ThrottledLog,
): Redis => {
	connection.on("error", (error: Error) =>
		log.warn(`queue:${role}`, "queue redis unavailable", {
			role,
			message: error.message,
		}),
	);
	const duplicate = connection.duplicate.bind(connection);
	connection.duplicate = ((override?: Partial<RedisOptions>) =>
		guardConnection(duplicate(override), role, log)) as Redis["duplicate"];
	return connection;
};

/**
 * Conexión propia de las colas, aparte de la de caché: BullMQ no admite
 * `keyPrefix` (usa su `prefix`) ni el timeout corto de comandos que la caché
 * necesita. El productor falla rápido; el worker espera a Redis lo que haga
 * falta, como exige BullMQ.
 */
export const createQueueConnection = (
	url: string,
	role: QueueRole,
	logger: Logger,
): Redis => {
	const log = createThrottledLog(logger, {
		intervalMs: REDIS_ERROR_LOG_INTERVAL_MS,
	});
	const connection = new Redis(url, {
		family: 0,
		connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
		retryStrategy: (attempt) => reconnectDelayMs(attempt),
		...(role === "producer"
			? { maxRetriesPerRequest: 1, enableOfflineQueue: false }
			: { maxRetriesPerRequest: null }),
	});
	return guardConnection(connection, role, log);
};

export interface QueueClient extends JobQueues {
	queueFor(name: QueueName): Queue;
	close(): Promise<void>;
}

export const createQueueClient = ({
	connection,
	prefix,
}: {
	connection: Redis;
	prefix: string;
}): QueueClient => {
	const queues = new Map<QueueName, Queue>();

	const queueFor = (name: QueueName) => {
		let queue = queues.get(name);
		if (!queue) {
			queue = new Queue(name, {
				connection,
				prefix,
				defaultJobOptions: QUEUE_DEFAULTS[name],
			});
			queues.set(name, queue);
		}
		return queue;
	};

	return {
		queueFor,
		async add(name, payload) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const timeout = new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("queue add timed out")),
					QUEUE_ADD_TIMEOUT_MS,
				);
			});
			try {
				await Promise.race([
					queueFor(QUEUE_OF[name]).add(
						name,
						payload,
						jobAddOptions(name, payload),
					),
					timeout,
				]);
			} finally {
				clearTimeout(timer);
			}
		},
		async close() {
			await Promise.all([...queues.values()].map((queue) => queue.close()));
		},
	};
};

const QUEUE_GLOBAL = Symbol.for("instituto-digital.queue-client");

type GlobalWithQueues = typeof globalThis & {
	[QUEUE_GLOBAL]?: QueueClient;
};

/**
 * Las colas del proceso web, o `null` sin `REDIS_URL`. En desarrollo se
 * reutilizan entre recargas en caliente, como las conexiones de caché.
 */
export const createQueueClientFromEnv = (
	env: Pick<Env, "REDIS_URL" | "REDIS_KEY_PREFIX" | "NODE_ENV">,
	logger: Logger,
): QueueClient | null => {
	if (!env.REDIS_URL) return null;

	const globalWithQueues = globalThis as GlobalWithQueues;
	const client =
		globalWithQueues[QUEUE_GLOBAL] ??
		createQueueClient({
			connection: createQueueConnection(env.REDIS_URL, "producer", logger),
			prefix: queuePrefixOf(env.REDIS_KEY_PREFIX),
		});
	if (env.NODE_ENV !== "production") globalWithQueues[QUEUE_GLOBAL] = client;
	return client;
};
