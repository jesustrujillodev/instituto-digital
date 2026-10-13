import type { RateLimiter } from "./rate-limiter";

type Window = { count: number; resetAt: number };

/**
 * El barrido solo libera memoria: cada intento ya compara con su `resetAt`.
 * Recorrer todas las claves en cada intento costaba O(claves vivas) por
 * petición; una vez por segundo basta para que el Map no crezca sin freno.
 */
const SWEEP_EVERY_MS = 1_000;

// Adaptador en memoria (ventana fija), por proceso. Es el limitador sin Redis y
// el respaldo cuando Redis no responde. Registrar como singleton de MÓDULO.
export const createMemoryRateLimiter = (): RateLimiter => {
	const windows = new Map<string, Window>();
	let nextSweepAt = 0;

	const sweep = (now: number) => {
		for (const [key, w] of windows) {
			if (w.resetAt <= now) windows.delete(key);
		}
	};

	return {
		async consume(key, { limit, windowMs }) {
			const now = Date.now();
			if (now >= nextSweepAt) {
				sweep(now);
				nextSweepAt = now + SWEEP_EVERY_MS;
			}

			const current = windows.get(key);

			if (!current || current.resetAt <= now) {
				windows.set(key, { count: 1, resetAt: now + windowMs });
				return { allowed: true, retryAfterMs: 0 };
			}

			current.count += 1;
			if (current.count > limit) {
				return { allowed: false, retryAfterMs: current.resetAt - now };
			}
			return { allowed: true, retryAfterMs: 0 };
		},
	};
};
