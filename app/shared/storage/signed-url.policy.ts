/**
 * Cuánto vive una firma y cuánto le tiene que quedar para entregarse.
 *
 * Una URL reutilizada es la misma para el navegador, que así sirve el video o el
 * PDF de su caché en vez de volver a descargarlo. Funciona porque la key de un
 * objeto nunca cambia de contenido (`object-key.ts` le pone marca de tiempo).
 */
export interface SignedUrlPolicy {
	signTtlS: number;
	/** Margen mínimo de vida al entregarla: nunca una URL a punto de vencer. */
	minRemainingS: number;
}

export interface SignedUrl {
	url: string;
	/** Epoch en ms en que la firma deja de valer. */
	expiresAt: number;
}

/** Lo que una firma puede quedarse en caché sin entregarse con menos margen. */
export const cacheTtlMsOf = (policy: SignedUrlPolicy): number =>
	(policy.signTtlS - policy.minRemainingS) * 1000;

export const isServable = (
	entry: SignedUrl,
	nowMs: number,
	policy: SignedUrlPolicy,
): boolean => entry.expiresAt - nowMs >= policy.minRemainingS * 1000;
