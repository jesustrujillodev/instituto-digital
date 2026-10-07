import type { CourseScopeWhere } from "@/modules/courses/domain/course.access";
import type { OpenEnrollmentRecord } from "./enrollment-summary.types";

export interface IEnrollmentSummaryRepository {
	/**
	 * Cursos del alcance con la inscripción abierta en `now` y sus invitaciones
	 * sin responder, hasta `take` cursos.
	 */
	findOpenCourses(params: {
		filter: CourseScopeWhere;
		now: Date;
		take: number;
	}): Promise<(OpenEnrollmentRecord & { invited: number })[]>;
}
