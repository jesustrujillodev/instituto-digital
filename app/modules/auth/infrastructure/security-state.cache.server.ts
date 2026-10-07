import type { InvalidationBus } from "@/shared/cache/invalidation-bus";
import type { Logger } from "@/shared/logging/logger";
import type {
	SecuritySnapshot,
	SecurityStateRepository,
} from "../domain/security-state.repository";

type Dependencies = {
	inner: SecurityStateRepository;
	/** Ventana de propagación del corte entre nodos. Ver AuthConfig. */
	ttlMs: number;
	logger: Logger;
	bus: InvalidationBus;
};

export const SECURITY_STATE_INVALIDATION_CHANNEL = "security-state:invalidate";

/**
 * Decorador con caché sobre el mismo puerto.
 *
 * Es lo que permite comprobar el epoch en cada petición sin pagar una lectura
 * por petición: el estado cambia casi nunca, así que se sirve de memoria y solo
 * se relee una vez por TTL.
 *
 * IMPORTANTE: registrar como singleton de MÓDULO (vive entre peticiones), nunca
 * con `asSingleton` del contenedor — ese contenedor es POR PETICIÓN y daría una
 * instancia nueva en cada request, que no cachearía nada. Misma forma que
 * `createMemorySingleFlight` y `createMemoryRateLimiter`.
 *
 * Con varios nodos cada proceso tiene su propia copia. Toda escritura avisa por
 * el bus y los demás nodos releen en cuanto llega el aviso; si el aviso se
 * pierde (Redis caído), el TTL sigue siendo la ventana máxima.
 */
export const createCachedSecurityStateRepository = ({
	inner,
	ttlMs,
	logger,
	bus,
}: Dependencies): SecurityStateRepository => {
	let cached: SecuritySnapshot | null = null;
	let expiresAt = 0;
	// Colapsa las lecturas concurrentes: al expirar el TTL bajo carga, mil
	// peticiones simultáneas deben producir UNA consulta, no mil.
	let inFlight: Promise<SecuritySnapshot> | null = null;
	// Una lectura que empezó antes de una invalidación trae el estado de antes:
	// puede responder a quien la esperaba, pero no queda cacheada.
	let generation = 0;

	// Escritura de este proceso: sin último valor conocido, para que en frío se
	// deniegue en vez de servir el estado de antes del corte.
	const invalidate = () => {
		cached = null;
		expiresAt = 0;
		generation += 1;
		inFlight = null;
	};

	// Aviso de otro nodo: se relee ya, pero el último valor conocido se queda
	// como respaldo, igual que cuando vence el TTL.
	const expire = () => {
		expiresAt = 0;
		generation += 1;
		inFlight = null;
	};

	bus.subscribe(SECURITY_STATE_INVALIDATION_CHANNEL, expire);

	const announce = () => bus.publish(SECURITY_STATE_INVALIDATION_CHANNEL);

	return {
		async get() {
			if (cached && expiresAt > Date.now()) return cached;
			if (inFlight) return inFlight;

			const readGeneration = generation;
			const read: Promise<SecuritySnapshot> = inner
				.get()
				.then((fresh) => {
					if (readGeneration === generation) {
						cached = fresh;
						expiresAt = Date.now() + ttlMs;
					}
					return fresh;
				})
				.catch((error: unknown) => {
					// ⚠️ EL PUNTO MÁS IMPORTANTE DE TODA LA IMPLEMENTACIÓN
					// (docs/auth/02-revocacion-inmediata-epoch.md §7.1).
					//
					// Si el store no responde se sirve el ÚLTIMO VALOR CONOCIDO: si
					// había corte, sigue habiéndolo. Si nunca se cargó (arranque en
					// frío con la base caída) se RELANZA — denegar.
					//
					// Un catch que devolviera "sin revocaciones" convertiría una caída
					// de la base de datos en la apertura automática de la plataforma.
					// Si solo se revisa una línea de este archivo, que sea ésta.
					if (cached) {
						logger.error("security state read failed — serving last known", {
							message: error instanceof Error ? error.message : String(error),
							staleForMs: Date.now() - cached.readAt.getTime(),
						});
						return cached;
					}
					throw error;
				})
				.finally(() => {
					if (inFlight === read) inFlight = null;
				});
			inFlight = read;

			return read;
		},

		// Toda escritura invalida la caché LOCAL, para que el proceso que ejecuta el
		// corte lo vea al instante, y avisa a los demás nodos.
		async revokeAllTokens() {
			const snapshot = await inner.revokeAllTokens();
			invalidate();
			await announce();
			return snapshot;
		},

		async revokeUserTokens(userId) {
			await inner.revokeUserTokens(userId);
			invalidate();
			await announce();
		},

		async lockdown(input) {
			const result = await inner.lockdown(input);
			invalidate();
			await announce();
			return result;
		},

		async lift() {
			const snapshot = await inner.lift();
			invalidate();
			await announce();
			return snapshot;
		},
	};
};
