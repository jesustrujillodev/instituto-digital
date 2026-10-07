import {
	REDIS_RECONNECT_BASE_MS,
	REDIS_RECONNECT_CAP_MS,
} from "./redis.config";

/**
 * Espera antes del reintento `attempt` (desde 1): exponencial con tope y la
 * mitad aleatoria, para que varios nodos no reconecten al mismo tiempo.
 *
 * Nunca devuelve `null`: ioredis dejaría de reintentar y el proceso se quedaría
 * sin Redis hasta reiniciarse.
 */
export const reconnectDelayMs = (
	attempt: number,
	random: () => number = Math.random,
): number => {
	const ceiling = Math.min(
		REDIS_RECONNECT_CAP_MS,
		REDIS_RECONNECT_BASE_MS * 2 ** attempt,
	);
	return Math.round(ceiling / 2 + (random() * ceiling) / 2);
};
