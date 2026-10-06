// Puerto agnóstico de rate limiting.
export interface RateLimitDecision {
	allowed: boolean;
	/** Milisegundos hasta que la clave vuelva a tener cupo (0 si allowed). */
	retryAfterMs: number;
}

export interface RateLimitPolicy {
	limit: number;
	windowMs: number;
}

export interface RateLimiter {
	/** Nunca lanza: un adaptador que pueda fallar se envuelve con el fallback. */
	consume(key: string, opts: RateLimitPolicy): Promise<RateLimitDecision>;
}
