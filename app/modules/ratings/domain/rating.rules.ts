import * as v from "valibot";
import {
	type CourseFormat,
	type CourseStatus,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/enrollment.config";
import { RATING_COMMENT_MAX_LENGTH, RATING_SCORE_RANGE } from "./rating.config";

const documentId = v.pipe(
	v.string("Falta el identificador del curso."),
	v.uuid("El identificador del curso no es válido."),
);

export const findRatingCourseRule = v.object({ documentId });

export const rateCourseRule = v.object({
	score: v.pipe(
		v.number("Elige una calificación."),
		v.integer("La calificación debe ser un número entero."),
		v.minValue(
			RATING_SCORE_RANGE.min,
			`La calificación mínima es ${RATING_SCORE_RANGE.min}.`,
		),
		v.maxValue(
			RATING_SCORE_RANGE.max,
			`La calificación máxima es ${RATING_SCORE_RANGE.max}.`,
		),
	),
	comment: v.pipe(
		v.optional(v.string("El comentario debe ser texto."), ""),
		v.trim(),
		v.maxLength(
			RATING_COMMENT_MAX_LENGTH,
			`El comentario no puede superar los ${RATING_COMMENT_MAX_LENGTH} caracteres.`,
		),
		v.transform((value): string | null => (value === "" ? null : value)),
	),
});

export const ratingRules = {
	find: findRatingCourseRule,
	rate: rateCourseRule,
} as const;

/**
 * §6.10: el curso está finalizado y la persona estuvo inscrita y asistió al
 * menos a una sesión. No exige haber completado: quien no aprobó también opina.
 *
 * Un autogestivo no se finaliza ni tiene sesiones: se valora al completarlo,
 * que es cuando termina para quien lo cursa (docs/adr/0014).
 */
export const canRateCourse = (input: {
	courseStatus: CourseStatus;
	courseFormat: CourseFormat;
	enrollmentStatus: EnrollmentStatus | null;
	attendedSessions: number;
	completed: boolean;
}): boolean => {
	if (input.enrollmentStatus !== "ENROLLED") return false;
	if (!requiresSessions(input.courseFormat)) return input.completed;

	return input.courseStatus === "FINISHED" && input.attendedSessions > 0;
};
