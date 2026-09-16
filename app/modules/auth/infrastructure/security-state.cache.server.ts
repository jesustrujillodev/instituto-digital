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
};

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
 * Con varios nodos cada proceso tiene su propia copia: el corte propaga en
 * `ttlMs` como máximo. Un store compartido (Redis) no lo haría instantáneo,
 * solo movería la caché de sitio.
 */
export const createCachedSecurityStateRepository = ({
	inner,
	ttlMs,
	logger,
}: Dependencies): SecurityStateRepository => {
	let cached: SecuritySnapshot | null = null;
	let expiresAt = 0;
	// Colapsa las lecturas concurrentes: al expirar el TTL bajo carga, mil
	// peticiones simultáneas deben producir UNA consulta, no mil.
	let inFlight: Promise<SecuritySnapshot> | null = null;

	const invalidate = () => {
		cached = null;
		expiresAt = 0;
	};

	return {
		async get() {
			if (cached && expiresAt > Date.now()) return cached;

			inFlight ??= inner
				.get()
				.then((fresh) => {
					cached = fresh;
					expiresAt = Date.now() + ttlMs;
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
					inFlight = null;
				});

			return inFlight;
		},

		// Toda escritura invalida la caché LOCAL para que la respuesta del proceso
		// que ejecuta el corte sea inmediata, aunque los demás nodos tarden el TTL.
		async revokeAllTokens() {
			const snapshot = await inner.revokeAllTokens();
			invalidate();
			return snapshot;
		},

		async revokeUserTokens(userId) {
			await inner.revokeUserTokens(userId);
			invalidate();
		},

		async lockdown(input) {
			const result = await inner.lockdown(input);
			invalidate();
			return result;
		},

		async lift() {
			const snapshot = await inner.lift();
			invalidate();
			return snapshot;
		},
	};
};
