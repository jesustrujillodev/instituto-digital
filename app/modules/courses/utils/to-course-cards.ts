import type { CourseSummary } from "../domain/course.types";

/**
 * Tarjeta del listado: el curso sin su PK interna y con la portada ya resuelta.
 *
 * `resolveCover` llega como argumento porque conoce el dominio público
 * configurado, que es infraestructura.
 */
export type CourseCard = Omit<CourseSummary, "id" | "coverImageUrl"> & {
	coverUrl: string | null;
};

export const toCourseCards = (
	courses: readonly CourseSummary[],
	resolveCover: (reference: string | null) => string | null,
): CourseCard[] =>
	courses.map(({ id: _internalId, coverImageUrl, ...course }) => ({
		...course,
		coverUrl: resolveCover(coverImageUrl),
	}));
