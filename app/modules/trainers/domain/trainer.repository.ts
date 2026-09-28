import type {
	CreateProfileData,
	TrainerDetail,
	TrainerSummary,
	UpdateProfileDto,
} from "./trainer.types";

/**
 * Ninguna lectura recibe alcance: los capacitadores se asignan desde cualquier
 * dependencia (§4) y las fichas se piden para cuentas que ya pasaron por el
 * alcance del listado de usuarios. Lo que sí se recorta son las mutaciones, y
 * eso lo decide el servicio con `canManageTrainer`.
 */
export interface ITrainerRepository {
	/** Capacitadores activos, sin paginar: una lista para elegir a mano no lleva tope. */
	findActive(): Promise<TrainerSummary[]>;
	/**
	 * Fichas por el `documentId` de la CUENTA —el perfil no tiene id público
	 * propio—, deshabilitadas incluidas.
	 */
	findByUserDocumentIds(
		userDocumentIds: readonly string[],
	): Promise<TrainerDetail[]>;
	/** Existencia del perfil, archivado incluido, para no duplicarlo al activar. */
	existsForUser(userId: number): Promise<boolean>;
	create(data: CreateProfileData): Promise<TrainerDetail>;
	update(userId: number, dto: UpdateProfileDto): Promise<TrainerDetail>;
	/** Desactiva el perfil sin borrarlo: conserva el historial de lo impartido. */
	archive(userId: number): Promise<TrainerDetail>;
	unarchive(userId: number): Promise<TrainerDetail>;
}
