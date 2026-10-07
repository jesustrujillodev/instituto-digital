import type { Redis } from "ioredis";
import type { ThrottledLog } from "../logging/throttled-log";
import { invalidationChannel } from "../redis/redis.keys.server";
import type { InvalidationBus } from "./invalidation-bus";

const BUS_GLOBAL = Symbol.for("instituto-digital.invalidation-bus");

type BusState = { subscriber: Redis; handlers: Map<string, () => void> };
type GlobalWithBus = typeof globalThis & { [BUS_GLOBAL]?: BusState };

/**
 * Pub/sub de Redis. Los handlers viven en un registro global atado a la conexión
 * suscrita: una recarga en caliente reemplaza el handler de cada canal en vez de
 * sumar listeners que seguirían llamando a cachés de módulos ya descartados.
 */
export const createRedisInvalidationBus = ({
	command,
	subscriber,
	keyPrefix,
	log,
}: {
	command: Redis;
	subscriber: Redis;
	keyPrefix: string;
	log: ThrottledLog;
}): InvalidationBus => {
	const globalWithBus = globalThis as GlobalWithBus;
	let state = globalWithBus[BUS_GLOBAL];
	if (state?.subscriber !== subscriber) {
		const handlers = new Map<string, () => void>();
		subscriber.on("message", (channel: string) => handlers.get(channel)?.());
		subscriber.on("ready", () => {
			for (const handler of handlers.values()) handler();
		});
		state = { subscriber, handlers };
		globalWithBus[BUS_GLOBAL] = state;
	}
	const { handlers } = state;

	return {
		async publish(channel) {
			try {
				await command.publish(invalidationChannel(keyPrefix, channel), "1");
			} catch (error) {
				log.warn("invalidation-bus", "invalidation not published", {
					channel,
					message: error instanceof Error ? error.message : String(error),
				});
			}
		},
		subscribe(channel, onInvalidate) {
			const fullChannel = invalidationChannel(keyPrefix, channel);
			if (!handlers.has(fullChannel)) {
				subscriber.subscribe(fullChannel).catch((error: unknown) =>
					log.warn("invalidation-bus", "invalidation subscribe failed", {
						channel,
						message: error instanceof Error ? error.message : String(error),
					}),
				);
			}
			handlers.set(fullChannel, onInvalidate);
		},
	};
};
