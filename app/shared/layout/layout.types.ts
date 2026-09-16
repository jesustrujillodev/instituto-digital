import type { PublicSecurityState } from "@/modules/auth/domain/security-state.service";
import type { SessionUser } from "@/shared/auth/session-user";
import type { OkResponse } from "@/shared/response/response.types";

/**
 * Contrato de datos del layout del dashboard: única fuente de verdad del shape
 * que produce `dashboard.layout.loader.ts` y que consume `useAuth()`.
 *
 * Tipar el hook contra esta interfaz (y no contra
 * `typeof import("./dashboard.layout.loader").loader`) hace que NINGÚN import
 * cruce la frontera servidor/cliente.
 *
 * Es `OkResponse` y no `AppResponse` porque este loader no tiene rama de fallo:
 * o hay sesión, o `requireAuth` ya redirigió a login.
 */
export type DashboardLayoutData = OkResponse<{
	user: SessionUser;
	/**
	 * `null` si la lectura del estado de seguridad falló (store caído + caché
	 * fría): el layout no expulsa a nadie por esto, pero tampoco pinta el banner
	 * — sin dato, "sin lockdown" y "no se sabe" no deben verse igual, así que se
	 * elige no afirmar nada en vez de afirmar lo que no consta.
	 */
	securityState: PublicSecurityState | null;
}>;
