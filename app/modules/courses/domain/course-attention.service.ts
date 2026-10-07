import type { AppResponse } from "@/shared/response/response.types";
import type { CourseScope } from "./course.access";
import type { CourseAttention } from "./course-attention.types";

/** Lo que el panel de inicio pide atender de los cursos del alcance. */
export interface ICourseAttentionService {
	/** Falla con `COURSE_FORBIDDEN_SCOPE` si el alcance no administra cursos. */
	summarize(
		scope: CourseScope,
		options: { limit: number },
	): Promise<AppResponse<CourseAttention>>;
}
