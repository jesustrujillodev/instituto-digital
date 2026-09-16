// Puerto agnóstico de rate limiting.
export interface RateLimitDecision {
	allowed: boolean;
	/** Milisegundos hasta que la clave vuelva a tener cupo (0 si allowed). */
	retryAfterMs: number;
}

export interface RateLimiter {
	consume(
		key: string,
		opts: { limit: number; windowMs: number },
	): RateLimitDecision;
}
