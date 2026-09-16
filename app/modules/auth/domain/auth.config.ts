// Configuración del módulo de auth — contrato agnóstico al framework.
// El adaptador de arranque (contenedor DI) la construye desde el entorno
// validado; el dominio y la aplicación solo conocen esta forma.
export interface AuthConfig {
	jwtSecret: string;
	/** Vida del access token (JWT) en segundos. */
	accessTokenTtlS: number;
	/** Vida del refresh token / sesión en segundos. */
	refreshTokenTtlS: number;
	/** Ventana de gracia del refresh (idempotencia + tolerancia a red) en segundos. */
	refreshGraceS: number;
	issuer: string;
	audience: string;
	/** Rate limiting del login. */
	loginMaxPerEmail: number;
	loginMaxPerIp: number;
	loginWindowS: number;
	/** Cap de sesiones activas por usuario; al exceder cae la más antigua. */
	maxSessionsPerUser: number;
	/**
	 * Cuánto se cachea el estado de seguridad en memoria, en segundos.
	 *
	 * Es el dial entre coste y propagación: con varios nodos, este número ES la
	 * ventana máxima entre escribir el epoch y que el corte surta efecto en todos.
	 */
	securityStateCacheTtlS: number;
}

/**
 * Valores por defecto del listado del monitor de sesiones.
 *
 * Fuente ÚNICA: los consumen el loader (cuando el query string no los trae),
 * el repositorio (para el skip/take) y el servicio (para construir la
 * `pagination` de la respuesta). Dos defaults distintos describirían una página
 * que no es la que realmente se consultó.
 *
 * No forma parte de `AuthConfig` porque no se deriva del entorno: es una
 * decisión de presentación, no de política de seguridad.
 */
export const SESSION_LIST_DEFAULTS = {
	page: 1,
	pageSize: 10,
} as const;
