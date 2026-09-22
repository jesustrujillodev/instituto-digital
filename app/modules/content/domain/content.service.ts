import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	ContentMutationResponse,
	ContentSummaryResponse,
	ContentTreeResponse,
	CreateLessonDto,
	CreateModuleDto,
	ReorderContentDto,
	UpdateLessonDto,
	UpdateModuleDto,
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
	): Promise<ContentMutationResponse>;
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
	): Promise<ContentMutationResponse>;
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
}
