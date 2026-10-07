import type { TeachingScope } from "./teaching.access";
import type {
	PendingFinishCourse,
	PendingFinishRecord,
	TeachingPending,
} from "./teaching.types";

/**
 * Lo que lleva más tiempo esperando, primero, con el lado desde el que le toca
 * a quien consulta: lo imparte, lo organiza su dependencia, o ambos.
 */
export const toTeachingPending = (
	records: readonly PendingFinishRecord[],
	scope: Pick<TeachingScope, "dependencyId">,
	limit: number,
): TeachingPending => ({
	awaitingFinish: [...records]
		.sort(
			(a, b) => a.lastSessionEndsAt.getTime() - b.lastSessionEndsAt.getTime(),
		)
		.slice(0, limit)
		.map(
			(record): PendingFinishCourse => ({
				documentId: record.documentId,
				title: record.title,
				lastSessionEndsAt: record.lastSessionEndsAt,
				enrolledCount: record.enrolledCount,
				teaching: record.viewerTeaches,
				organizing: record.dependencyId === scope.dependencyId,
			}),
		),
	truncated: records.length > limit,
});
