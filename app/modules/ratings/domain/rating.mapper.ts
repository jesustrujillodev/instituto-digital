import type { CourseRatingSummary } from "./rating.types";

/**
 * Promedio a un decimal y comentarios sin autor. La fila de entrada no trae
 * `userId`: el anonimato se garantiza desde la proyección, no desde aquí.
 */
export const toCourseRatingSummary = (
	rows: readonly { score: number; comment: string | null; createdAt: Date }[],
): CourseRatingSummary => {
	if (rows.length === 0) return { average: null, count: 0, comments: [] };

	const total = rows.reduce((sum, row) => sum + row.score, 0);

	return {
		average: Math.round((total / rows.length) * 10) / 10,
		count: rows.length,
		comments: rows.flatMap((row) =>
			row.comment
				? [{ score: row.score, comment: row.comment, createdAt: row.createdAt }]
				: [],
		),
	};
};
