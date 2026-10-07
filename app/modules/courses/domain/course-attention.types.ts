/** Un curso que pide algo a quien lo organiza. */
export interface CourseAttentionItem {
	documentId: string;
	title: string;
	updatedAt: Date;
	firstSessionAt: Date | null;
}

export interface CourseAttentionList {
	courses: CourseAttentionItem[];
	/** Había más de los que se leyeron. */
	truncated: boolean;
}

/** Lo que el panel de inicio pide atender de los cursos que se organizan. */
export interface CourseAttention {
	drafts: CourseAttentionList;
	/** Publicados que exigen capacitador y ya no tienen ninguno activo. */
	withoutTrainer: CourseAttentionList;
}
