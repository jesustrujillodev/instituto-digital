// Puerto agnóstico de deduplicación de ejecución + caché de resultado.
// Uso principal: refresh de sesión idempotente — el refresh token entrante
// actúa como clave y N peticiones concurrentes o rezagadas dentro de la
// ventana comparten UNA ejecución (docs/auth/00-sistema-autenticacion.md §6.2).
export interface SingleFlight {
	/**
	 * Ejecuta fn UNA sola vez por clave dentro de la ventana ttlMs.
	 * - Llamadas concurrentes con la misma clave comparten la promesa en vuelo.
	 * - Llamadas posteriores dentro de ttlMs reciben el resultado CACHEADO.
	 * - Un resultado rechazado se desaloja de inmediato (permite reintentar).
	 */
	run<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}
