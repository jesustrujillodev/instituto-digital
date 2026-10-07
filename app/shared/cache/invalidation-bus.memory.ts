import type { InvalidationBus } from "./invalidation-bus";

/** Un solo proceso: el aviso llega a sí mismo, igual que con Redis. */
export const createMemoryInvalidationBus = (): InvalidationBus => {
	const handlers = new Map<string, () => void>();

	return {
		async publish(channel) {
			handlers.get(channel)?.();
		},
		subscribe(channel, onInvalidate) {
			handlers.set(channel, onInvalidate);
		},
	};
};
