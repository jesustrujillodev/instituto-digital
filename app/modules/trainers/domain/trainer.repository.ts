import type {
	CreateProfileData,
	ListTrainersDto,
	TrainerDetail,
	TrainerSummary,
	UpdateProfileDto,
} from "./trainer.types";

/**
 * El catálogo NO recibe alcance, a diferencia del resto de listados del
 * sistema: §4 del alcance lo quiere global para que cualquier titular pueda
 * asignar a cualquier capacitador activo. Lo que sí se recorta son las
 * mutaciones, y eso lo decide el servicio con `canManageTrainer`.
 */
export interface ITrainerRepository {
	findAll(filters: ListTrainersDto): Promise<TrainerSummary[]>;
	/** Total con los mismos filtros, sin paginar — para la meta del listado. */
	count(filters: ListTrainersDto): Promise<number>;
	/** Ficha por el `documentId` de la CUENTA: el perfil no tiene id público propio. */
	findByUserDocumentId(userDocumentId: string): Promise<TrainerDetail | null>;
	/** Existencia del perfil, archivado incluido, para no duplicarlo al activar. */
	existsForUser(userId: number): Promise<boolean>;
	create(data: CreateProfileData): Promise<TrainerDetail>;
	update(userId: number, dto: UpdateProfileDto): Promise<TrainerDetail>;
	/** Desactiva el perfil sin borrarlo: conserva el historial de lo impartido. */
	archive(userId: number): Promise<TrainerDetail>;
	unarchive(userId: number): Promise<TrainerDetail>;
}
