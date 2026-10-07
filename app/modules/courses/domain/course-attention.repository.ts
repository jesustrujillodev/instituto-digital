import type { CourseScopeWhere } from "./course.access";
import type { CourseAttentionItem } from "./course-attention.types";

export interface ICourseAttentionRepository {
	/** Borradores del alcance, del último editado al más viejo. */
	findDrafts(
		filter: CourseScopeWhere,
		take: number,
	): Promise<CourseAttentionItem[]>;
	/**
	 * Publicados del alcance que exigen capacitador (`requiresTrainer`) y no
	 * tienen ninguno activo: cuenta archivada o perfil desactivado.
	 */
	findWithoutActiveTrainer(
		filter: CourseScopeWhere,
		take: number,
	): Promise<CourseAttentionItem[]>;
}
