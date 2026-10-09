import {
	countsContent,
	evaluatesByQuiz,
	gradesAutomatically,
} from "@/modules/courses/domain/course.rules";
import { syncsOnWrite } from "@/modules/teaching/domain/teaching.rules";
import type { ICradle } from "@/shared/di/container.types";
import {
	CONTENT_DONE_PERCENT,
	countedScoresOf,
	progressPercentOf,
} from "../domain/classroom.rules";
import type { IProgressSync } from "../domain/classroom.service";
import { toCourseContentTree } from "../domain/content.mapper";
import {
	courseGradeOf,
	courseResultOf,
	courseScoresOf,
	followUpStateOf,
	followUpWindowOf,
} from "../domain/quiz.rules";

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
	async recalculate(course, actorId, at, userIds, options) {
		// El mismo `FOR UPDATE` que la impartición: dos avances simultáneos no
		// pueden otorgar créditos calculados sobre datos viejos.
		await enrollmentRepository.lockCourse(course.id);

		const [
			rows,
			states,
			completedRows,
			scoreRows,
			finalRows,
			followUps,
			followUpRows,
		] = await Promise.all([
			contentRepository.findTree(course.id),
			enrollmentRepository.findProgressStates(course.id, userIds),
			classroomRepository.findCompletedLessons(course.id, userIds),
			quizRepository.findBestScores(course.id, userIds),
			evaluatesByQuiz(course)
				? quizRepository.findFinalBestScores(course.id, userIds)
				: [],
			quizRepository.findFollowUps(course.id),
			quizRepository.findFollowUpBestScores(course.id, userIds),
		]);
		const tree = toCourseContentTree(rows);

		const doneByUser = new Map<number, Set<string>>();
		const markDone = (userId: number, documentId: string) => {
			const done = doneByUser.get(userId) ?? new Set<string>();
			done.add(documentId);
			doneByUser.set(userId, done);
		};
		for (const row of completedRows) markDone(row.userId, row.lessonDocumentId);
		for (const row of scoreRows) markDone(row.userId, row.itemDocumentId);

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

		// La nota es el promedio de lo que cuenta y se acredita con la mínima
		// (docs/adr/0024, 0027). Hace falta el examen final presentado y el
		// temario terminado, si se piden. Con el crédito ya dado, queda fija.
		const counted = followUps
			.filter((followUp) => followUp.countsTowardGrade)
			.map((followUp) => ({
				id: followUp.id,
				closed:
					options?.closing === true ||
					followUpStateOf(
						followUpWindowOf(followUp, followUp.session),
						course.status,
						at,
					) === "CLOSED",
			}));
		const finalBestOf = new Map(
			finalRows.map((row) => [row.userId, row.score]),
		);
		const followUpBestOf = new Map(
			followUpRows.map((row) => [`${row.quizId}:${row.userId}`, row.score]),
		);
		const byContent = countsContent(course.completionRule);

		const graded = gradesAutomatically(course, counted.length)
			? results.flatMap(({ state, contentCompleted }) => {
					const finalBest = finalBestOf.get(state.userId) ?? null;
					if (state.completed) return [];
					if (evaluatesByQuiz(course) && finalBest === null) return [];
					if (byContent && !contentCompleted) return [];

					const grade = courseGradeOf(
						courseScoresOf({
							content: byContent
								? countedScoresOf(
										tree,
										scoreRows.filter((row) => row.userId === state.userId),
									)
								: [],
							finalBest,
							followUps: counted.map((followUp) => ({
								countsTowardGrade: true,
								closed: followUp.closed,
								best:
									followUpBestOf.get(`${followUp.id}:${state.userId}`) ?? null,
							})),
						}),
					);
					if (grade === null) return [];
					const result = courseResultOf(grade, course.minPassingGrade);
					return result === state.result && grade === state.grade
						? []
						: [{ userId: state.userId, result, grade }];
				})
			: [];
		if (graded.length > 0) {
			await enrollmentRepository.saveResults(course.id, graded, actorId, at);
		}

		const completes =
			results.some(({ finishesNow }) => finishesNow) ||
			graded.some(({ result }) => result === "PASSED");
		if (completes && syncsOnWrite(course)) {
			await completionSync.sync(course.id, actorId, at);
		}

		return results.map(({ state, percent, contentCompleted }) => ({
			userId: state.userId,
			percent,
			contentCompleted,
		}));
	},
});
