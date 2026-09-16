import type { AppResponse } from "@/shared/response/response.types";
import type { LockdownDto } from "./auth.types";
import type { LockdownScope } from "./security-state.repository";

/** Foto del estado de seguridad segura para exponer fuera del servidor. */
export interface PublicSecurityState {
	lockdownAt: Date | null;
	lockdownScope: LockdownScope | null;
	lockdownBy: number | null;
	// `lockdownReason` NUNCA sale de aquí — es contexto para quien opera, no
	// para quien queda fuera ni para el resto del panel.
}

/**
 * Casos de uso del cierre de plataforma (lockdown).
 *
 * Separado de `SessionMonitorService` a propósito: aquel opera sobre sesiones
 * concretas, este sobre la política global que decide si se puede emitir más
 * acceso. Compartirlos mezclaría la acción más destructiva del sistema con
 * operaciones de lectura/revocación puntual.
 */
export interface SecurityStateService {
	getState(): Promise<AppResponse<PublicSecurityState>>;

	/** Las tres escrituras atómicas del cierre. Loguea a `warn`. */
	lockdown(
		dto: LockdownDto,
		by: number,
	): Promise<AppResponse<{ purgedSessions: number }>>;

	/** `lockdownAt = null`. No revierte `tokensValidAfter`. Loguea a `warn`. */
	lift(): Promise<AppResponse<null>>;
}
