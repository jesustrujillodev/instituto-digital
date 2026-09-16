import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	ActivateProfileDto,
	CreateExternalTrainerDto,
	ListTrainersDto,
	TrainerListResponse,
	TrainerResponse,
	UpdateProfileDto,
} from "./trainer.types";

/**
 * Casos de uso del módulo.
 *
 * Todos devuelven el envelope estándar y ninguno lanza para los fallos
 * esperados. Las LECTURAS no reciben alcance —el catálogo es global— y las
 * MUTACIONES reciben el `AuthContext` completo, porque tienen que comparar
 * alcance y rango sobre la cuenta afectada.
 */
export interface ITrainerService {
	list(filters: ListTrainersDto): Promise<TrainerListResponse>;
	/** Falla con `TRAINER_PROFILE_NOT_FOUND` si la cuenta no tiene perfil. */
	findByUser(userDocumentId: string): Promise<TrainerResponse>;
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
