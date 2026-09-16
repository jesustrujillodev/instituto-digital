/**
 * Puerto del estado de seguridad de la plataforma.
 *
 * Lo consume el camino MÁS caliente del sistema (el middleware, en cada
 * petición autenticada), así que el contrato está escrito para que el lector
 * sea barato: una sola foto completa por lectura, cacheable, sin consultas por
 * sesión ni por usuario.
 *
 * Ver docs/auth/02-revocacion-inmediata-epoch.md.
 */

/** Alcances de un lockdown. Inertes en Fase A; los activa la Fase B. */
export const LOCKDOWN_SCOPES = ["all", "except-admin"] as const;
export type LockdownScope = (typeof LOCKDOWN_SCOPES)[number];

/** Foto completa del estado de seguridad en un instante. */
export interface SecuritySnapshot {
	/** Epoch global: todo access token con `iat` anterior queda invalidado. */
	tokensValidAfter: Date;
	lockdownAt: Date | null;
	lockdownScope: LockdownScope | null;
	/** Texto interno de operación. NUNCA viaja al cliente. */
	lockdownReason: string | null;
	lockdownBy: number | null;
	/**
	 * userId → epoch, SOLO los vigentes (más recientes que el TTL del access
	 * token). Los anteriores son irrelevantes: los tokens que podrían invalidar
	 * ya expiraron por su cuenta, así que incluirlos sería cargar memoria para
	 * comparar contra nada. Es lo que mantiene esta lectura acotada y no
	 * creciente con el número de revocaciones históricas.
	 */
	userTokensValidAfter: ReadonlyMap<number, Date>;
	/** Instante de la lectura — según el reloj del proceso, solo diagnóstico. */
	readAt: Date;
}

export interface SecurityStateRepository {
	/**
	 * LANZA si no hay estado disponible. Nunca devuelve un estado "por defecto":
	 * inventar `tokensValidAfter = 0` ante un fallo convertiría una caída del
	 * store en "aquí no se ha revocado nada nunca", que es exactamente el
	 * fail-open que este mecanismo existe para evitar.
	 */
	get(): Promise<SecuritySnapshot>;

	/**
	 * Sube el epoch GLOBAL a `now()` del STORE (no del proceso): mata todos los
	 * access tokens vivos de la plataforma. Devuelve el estado ya actualizado.
	 */
	revokeAllTokens(): Promise<SecuritySnapshot>;

	/**
	 * Sube el epoch de UN usuario a `now()` del STORE: mata sus access tokens
	 * sin tocar los de nadie más.
	 */
	revokeUserTokens(userId: number): Promise<void>;

	/**
	 * Las tres escrituras del cierre, ATÓMICAS (docs/reglas.md §8.1):
	 * sube el epoch global, purga sesiones según el alcance y activa el flag de
	 * lockdown. Fuera de una transacción hay ventanas reales en cualquier orden.
	 */
	lockdown(input: {
		scope: LockdownScope;
		reason?: string;
		by: number;
	}): Promise<{ snapshot: SecuritySnapshot; purgedSessions: number }>;

	/** `lockdownAt = null`. `tokensValidAfter` NO se revierte. */
	lift(): Promise<SecuritySnapshot>;
}
