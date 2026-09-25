import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	ContentCreatedResponse,
	ContentMutationResponse,
	ContentSummaryResponse,
	ContentTreeResponse,
	CreateLessonDto,
	CreateModuleDto,
	MaterialResponse,
	ReorderContentDto,
	SaveMaterialDto,
	UpdateLessonDto,
	UpdateModuleDto,
	UploadTicketResponse,
	UploadUrlDto,
} from "./content.types";

export interface IContentService {
	/** El temario completo, para el paso del alta y para su propia pantalla. */
	findTree(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ContentTreeResponse>;
	/** Los conteos que alimentan el pendiente de publicación. */
	summarize(
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ContentSummaryResponse>;

	createModule(
		courseDocumentId: string,
		dto: CreateModuleDto,
		actor: AuthContext,
	): Promise<ContentCreatedResponse>;
	updateModule(
		courseDocumentId: string,
		dto: UpdateModuleDto,
		actor: AuthContext,
	): Promise<ContentMutationResponse>;
	/** Solo si ya no le quedan lecciones activas. */
	archiveModule(
		courseDocumentId: string,
		moduleDocumentId: string,
		actor: AuthContext,
	): Promise<ContentMutationResponse>;

	createLesson(
		courseDocumentId: string,
		dto: CreateLessonDto,
		actor: AuthContext,
	): Promise<ContentCreatedResponse>;
	updateLesson(
		courseDocumentId: string,
		dto: UpdateLessonDto,
		actor: AuthContext,
	): Promise<ContentMutationResponse>;
	archiveLesson(
		courseDocumentId: string,
		lessonDocumentId: string,
		actor: AuthContext,
	): Promise<ContentMutationResponse>;

	/** Recibe el árbol entero: valida que sea una permutación y lo reescribe. */
	reorder(
		courseDocumentId: string,
		dto: ReorderContentDto,
		actor: AuthContext,
	): Promise<ContentMutationResponse>;

	/** El material de una lección, con su URL de lectura ya firmada. */
	findMaterial(
		courseDocumentId: string,
		lessonDocumentId: string,
		actor: AuthContext,
	): Promise<MaterialResponse>;
	/**
	 * El permiso para que el navegador escriba en el bucket.
	 *
	 * Valida y genera la key aquí: nada de lo que mande el cliente decide dónde
	 * cae el objeto.
	 */
	createUploadUrl(
		courseDocumentId: string,
		dto: UploadUrlDto,
		actor: AuthContext,
	): Promise<UploadTicketResponse>;
	/** Guarda el material y confirma la subida, si la hubo. */
	saveMaterial(
		courseDocumentId: string,
		dto: SaveMaterialDto,
		actor: AuthContext,
	): Promise<ContentMutationResponse>;
}
