import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	courseScopeWriteWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import { canEdit } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import {
	ContentCourseNotEditableError,
	ContentCourseNotFoundError,
} from "../domain/content.errors";
import type { ContentCourseRef } from "../domain/content.types";

/**
 * Quién administra el temario y los cuestionarios de un curso: el alcance de
 * escritura sobre ese curso, igual que editar su ficha. No hay rol de
 * capacitador (docs/adr/0012).
 */
export const createContentCourseGate = (
	contentRepository: ICradle["contentRepository"],
) => {
	/**
	 * Fuera de alcance responde igual que inexistente: quien no administra el
	 * curso no confirma por URL que exista.
	 */
	const requireCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ContentCourseRef> => {
		const where = courseScopeWriteWhere(resolveCourseScope(actor));
		if (!where) throw new ContentCourseNotFoundError();

		const course = await contentRepository.findCourse(courseDocumentId, where);
		if (!course) throw new ContentCourseNotFoundError();
		return course;
	};

	/** Solo cambia mientras el curso admite edición. */
	const requireEditableCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ContentCourseRef> => {
		const course = await requireCourse(courseDocumentId, actor);
		if (!canEdit(course.status)) {
			throw new ContentCourseNotEditableError(course.status);
		}
		return course;
	};

	return { requireCourse, requireEditableCourse };
};
