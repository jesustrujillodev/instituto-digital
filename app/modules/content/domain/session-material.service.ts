import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AppResponse } from "@/shared/response/response.types";
import type { UploadTicket } from "./content.types";
import type {
	CreateSessionMaterialDto,
	ParticipantSessionMaterials,
	RemoveSessionMaterialDto,
	SessionMaterialBoard,
	SessionUploadUrlDto,
	UpdateSessionMaterialDto,
} from "./session-material.types";

/** El material de apoyo de las sesiones de un curso (docs/adr/0026). */
export interface ISessionMaterialService {
	findBoard(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<AppResponse<SessionMaterialBoard>>;
	/** Vacío si quien pregunta no está inscrito: una baja deja de verlo. */
	findForParticipant(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<AppResponse<ParticipantSessionMaterials[]>>;
	createUploadUrl(
		courseDocumentId: string,
		dto: SessionUploadUrlDto,
		actor: AuthContext,
	): Promise<AppResponse<UploadTicket>>;
	create(
		courseDocumentId: string,
		dto: CreateSessionMaterialDto,
		actor: AuthContext,
	): Promise<AppResponse<{ documentId: string }>>;
	update(
		courseDocumentId: string,
		dto: UpdateSessionMaterialDto,
		actor: AuthContext,
	): Promise<AppResponse<null>>;
	remove(
		courseDocumentId: string,
		dto: RemoveSessionMaterialDto,
		actor: AuthContext,
	): Promise<AppResponse<null>>;
}
