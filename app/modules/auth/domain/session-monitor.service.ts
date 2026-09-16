import type {
	ListSessionsDto,
	RevokedCountResponse,
	SessionListResponse,
	SessionVoidResponse,
} from "./auth.types";

/**
 * Casos de uso del monitor de sesiones (panel de administración).
 *
 * Vive separado de `AuthService` a propósito: aquel resuelve la sesión de QUIEN
 * pide (login, refresh, logout propio) y parte de él corre en el middleware;
 * este opera sobre las sesiones de TERCEROS y siempre detrás de un `requireRole`.
 * Mezclarlos pondría operaciones destructivas en el mismo objeto que consume el
 * camino caliente de cada petición.
 *
 * Todos los métodos devuelven el envelope estándar y ninguno lanza para los
 * fallos esperados — la autorización es responsabilidad del adaptador de
 * entrada, no de este puerto.
 */
export interface SessionMonitorService {
	/**
	 * Página del listado global de sesiones.
	 *
	 * `currentRefreshToken` solo sirve para marcar `isCurrent` en la fila propia;
	 * no filtra ni autoriza nada. Si se omite, ninguna fila queda marcada.
	 */
	list(
		filters: ListSessionsDto,
		currentRefreshToken?: string,
	): Promise<SessionListResponse>;

	/** Falla con `SESSION_NOT_FOUND` si el id ya no existe. */
	revoke(sessionId: string): Promise<SessionVoidResponse>;

	/** Cierra todas las sesiones de un usuario concreto. Idempotente. */
	revokeAllForUser(userId: number): Promise<SessionVoidResponse>;

	/**
	 * Cierre global: revoca TODAS las sesiones de la plataforma salvo la de quien
	 * ejecuta la acción.
	 *
	 * Recibe el refresh token crudo —igual que `AuthService.logout`— y es este
	 * servicio quien lo hashea: el adaptador de entrada nunca manipula secretos.
	 *
	 * Si el token no resuelve a una sesión, falla con `INVALID_SESSION` en lugar
	 * de revocar. Sin una sesión que preservar la operación expulsaría también a
	 * quien la pidió, y eso no es lo que pidió.
	 */
	revokeAllExceptCurrent(
		currentRefreshToken: string,
	): Promise<RevokedCountResponse>;

	/** Higiene de datos: elimina las sesiones ya expiradas. */
	cleanupExpired(): Promise<RevokedCountResponse>;
}
