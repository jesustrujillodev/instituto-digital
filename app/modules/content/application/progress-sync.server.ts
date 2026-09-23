import { syncsOnWrite } from "@/modules/teaching/domain/teaching.rules";
import type { ICradle } from "@/shared/di/container.types";
import {
	CONTENT_DONE_PERCENT,
	progressPercentOf,
} from "../domain/classroom.rules";
import type { IProgressSync } from "../domain/classroom.service";
import { toCourseContentTree } from "../domain/content.mapper";

type Dependencies = {
	contentRepository: ICradle["contentRepository"];
	classroomRepository: ICradle["classroomRepository"];
	quizRepository: ICradle["quizRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	completionSync: ICradle["completionSync"];
};

export const createProgressSync = ({
	contentRepository,
	classroomRepository,
	quizRepository,
	enrollmentRepository,
	completionSync,
}: Dependencies): IProgressSync => ({
	async recalculate(course, actorId, at, userIds) {
		// El mismo `FOR UPDATE` que la impartición: dos avances simultáneos no
		// pueden otorgar créditos calculados sobre datos viejos.
		await enrollmentRepository.lockCourseSeats(course.id);

		const [rows, states, completedRows, passedRows] = await Promise.all([
			contentRepository.findTree(course.id),
			enrollmentRepository.findProgressStates(course.id),
			classroomRepository.findCompletedLessons(course.id, userIds),
			quizRepository.findPassedModuleQuizzes(course.id, userIds),
		]);
		const tree = toCourseContentTree(rows);

		const doneByUser = new Map<number, Set<string>>();
		const markDone = (userId: number, documentId: string) => {
			const done = doneByUser.get(userId) ?? new Set<string>();
			done.add(documentId);
			doneByUser.set(userId, done);
		};
		for (const row of completedRows) markDone(row.userId, row.lessonDocumentId);
		for (const row of passedRows) markDone(row.userId, row.quizDocumentId);

		const targets = userIds
			? states.filter((state) => userIds.includes(state.userId))
			: states;

		const results = targets.map((state) => {
			const percent = progressPercentOf(
				tree,
				doneByUser.get(state.userId) ?? new Set(),
			);
			// Se fija una vez y no se borra: una lección obligatoria añadida
			// después no le quita el completado a quien ya terminó.
			const finishesNow =
				percent === CONTENT_DONE_PERCENT && state.contentCompletedAt === null;

			return {
				state,
				percent,
				finishesNow,
				contentCompleted: state.contentCompletedAt !== null || finishesNow,
			};
		});

		const writes = results
			.filter(
				({ state, percent, finishesNow }) =>
					finishesNow || percent !== state.progressPercent,
			)
			.map(({ state, percent, finishesNow }) => ({
				userId: state.userId,
				percent,
				completedAt: finishesNow ? at : null,
			}));
		if (writes.length > 0) {
			await enrollmentRepository.saveProgress(course.id, writes);
		}

		if (
			results.some(({ finishesNow }) => finishesNow) &&
			syncsOnWrite(course)
		) {
			await completionSync.sync(course.id, actorId, at);
		}

		return results.map(({ state, percent, contentCompleted }) => ({
			userId: state.userId,
			percent,
			contentCompleted,
		}));
	},
});
