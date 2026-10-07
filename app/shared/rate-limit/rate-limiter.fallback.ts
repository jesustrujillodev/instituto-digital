import type { ThrottledLog } from "../logging/throttled-log";
import type { RateLimiter } from "./rate-limiter";

/**
 * Si el limitador compartido falla, decide el del proceso.
 *
 * Mientras dure la caída cada nodo cuenta por su cuenta (el límite efectivo es
 * límite × nodos), pero el login nunca se queda sin freno.
 */
export const createFallbackRateLimiter = ({
	primary,
	fallback,
	log,
}: {
	primary: RateLimiter;
	fallback: RateLimiter;
	log: ThrottledLog;
}): RateLimiter => ({
	async consume(key, opts) {
		try {
			return await primary.consume(key, opts);
		} catch (error) {
			log.warn("rate-limiter", "rate limiter fell back to in-process", {
				message: error instanceof Error ? error.message : String(error),
			});
			return fallback.consume(key, opts);
		}
	},
});
