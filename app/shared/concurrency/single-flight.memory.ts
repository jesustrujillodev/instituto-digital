import type { SingleFlight } from "./single-flight";

type Entry = { promise: Promise<unknown>; expiresAt: number };

// Adaptador en memoria — suficiente para un solo proceso. Con varios nodos,
// implementar el mismo puerto sobre un store compartido (p. ej. Redis SET NX).
// IMPORTANTE: registrar como singleton de MÓDULO (vive entre peticiones);
// una instancia por petición no deduplica nada.
export const createMemorySingleFlight = (): SingleFlight => {
	const entries = new Map<string, Entry>();

	const sweep = () => {
		const now = Date.now();
		for (const [key, entry] of entries) {
			if (entry.expiresAt <= now) entries.delete(key);
		}
	};

	return {
		run<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
			sweep();

			const existing = entries.get(key);
			if (existing && existing.expiresAt > Date.now()) {
				return existing.promise as Promise<T>;
			}

			const promise = fn();
			entries.set(key, { promise, expiresAt: Date.now() + ttlMs });
			// Los rechazos no se cachean: la siguiente llamada reintenta.
			promise.catch(() => entries.delete(key));
			return promise;
		},
	};
};
