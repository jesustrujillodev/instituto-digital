import type { ICradle } from "@/shared/di/container.types";
import type { JOB_NAMES } from "@/shared/queue/queue.config";
import type { JobPayloads } from "@/shared/queue/queue.payloads";

type Dependencies = {
	runInTransaction: ICradle["runInTransaction"];
	contentRepository: ICradle["contentRepository"];
	progressSync: ICradle["progressSync"];
};

/**
 * Trabajo `recalculate-progress`: un cambio en qué cuenta para el avance
 * (lección obligatoria, evaluación de módulo, seguimiento cerrado) recalcula a
 * todo inscrito. Relee el curso porque pudo cambiar desde que se encoló; uno
 * que ya no está publicado no tiene avance en curso.
 */
export const createProgressRecalculation =
	({ runInTransaction, contentRepository, progressSync }: Dependencies) =>
	({
		courseId,
		actorId,
		at,
	}: JobPayloads[typeof JOB_NAMES.recalculateProgress]): Promise<void> =>
		runInTransaction(async () => {
			const course = await contentRepository.findCourseRef(courseId);
			if (course?.status !== "PUBLISHED") return;

			await progressSync.recalculate(course, actorId, new Date(at));
		});
