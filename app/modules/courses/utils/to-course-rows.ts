import type { CourseSummary } from "../domain/course.types";

/**
 * Fila de la tabla: el curso con el `id` de tipo string que exige DataTable.
 *
 * El `id` numérico se sustituye —no se añade— por `documentId`: la PK interna
 * no tiene por qué viajar al cliente.
 */
export type CourseRow = Omit<CourseSummary, "id"> & { id: string };

export const toCourseRows = (courses: readonly CourseSummary[]): CourseRow[] =>
	courses.map(({ id: _internalId, ...course }) => ({
		...course,
		id: course.documentId,
	}));
