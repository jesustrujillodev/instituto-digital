import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	ActivateProfileDto,
	CreateExternalTrainerDto,
	TrainerListResponse,
	TrainerResponse,
	UpdateProfileDto,
} from "./trainer.types";

/**
 * Casos de uso del módulo.
 *
 * Todos devuelven el envelope estándar y ninguno lanza para los fallos
 * esperados. Las MUTACIONES reciben el `AuthContext` completo, porque tienen que
 * comparar alcance y rango sobre la cuenta afectada.
 */
export interface ITrainerService {
	/**
	 * Perfiles —activos o deshabilitados— de las cuentas indicadas, con sus
	 * estadísticas. Las cuentas sin perfil no aparecen.
	 *
	 * No recibe alcance: lo aplicó quien obtuvo esas cuentas, que es el listado de
	 * usuarios. Sirve para completar sus filas, no para descubrir personas.
	 */
	listByUsers(userDocumentIds: readonly string[]): Promise<TrainerListResponse>;
	/**
	 * Activa el perfil sobre una cuenta interna existente. Revoca sus tokens: el
	 * claim `isTrainer` viaja firmado y sin esto tardaría en notarse lo que dure
	 * su access token.
	 */
	activateProfile(
		dto: ActivateProfileDto,
		actor: AuthContext,
	): Promise<TrainerResponse>;
	updateProfile(
		userDocumentId: string,
		dto: UpdateProfileDto,
		actor: AuthContext,
	): Promise<TrainerResponse>;
	deactivateProfile(
		userDocumentId: string,
		actor: AuthContext,
	): Promise<TrainerResponse>;
	reactivateProfile(
		userDocumentId: string,
		actor: AuthContext,
	): Promise<TrainerResponse>;
	/**
	 * Alta de capacitador externo: la cuenta y el perfil en una sola transacción.
	 *
	 * Las dos escrituras o ninguna. Un externo sin perfil violaría §4 del alcance
	 * y la base no puede impedirlo, porque el dato que decide está en otra tabla.
	 */
	createExternal(
		dto: CreateExternalTrainerDto,
		actor: AuthContext,
	): Promise<TrainerResponse>;
}
