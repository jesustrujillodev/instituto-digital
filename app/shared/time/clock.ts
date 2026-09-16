/** Fuente del instante actual; se inyecta para probar reglas con fechas usando un reloj fijo. */
export interface Clock {
	now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
