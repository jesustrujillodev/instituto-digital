import type { RateLimiter } from "./rate-limiter";

type Window = { count: number; resetAt: number };

// Adaptador en memoria (ventana fija), por proceso. Es el limitador sin Redis y
// el respaldo cuando Redis no responde. Registrar como singleton de MÓDULO.
export const createMemoryRateLimiter = (): RateLimiter => {
	const windows = new Map<string, Window>();

	const sweep = () => {
		const now = Date.now();
		for (const [key, w] of windows) {
			if (w.resetAt <= now) windows.delete(key);
		}
	};

	return {
		async consume(key, { limit, windowMs }) {
			sweep();

			const now = Date.now();
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
