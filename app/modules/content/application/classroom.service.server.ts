import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	countsContent,
	evaluatesByQuiz,
} from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	assertCanProgress,
	assertClassroomReadable,
	type LessonProgressStatus,
	neighborsOf,
	nextProgressStatus,
	progressCountOf,
	progressPercentOf,
	resumeStopOf,
} from "../domain/classroom.rules";
import type { IClassroomService } from "../domain/classroom.service";
import type {
	ClassroomCourse,
	ClassroomLesson,
	ClassroomQuizStatus,
	RecordProgressDto,
} from "../domain/classroom.types";
import {
	ContentCourseNotFoundError,
	ContentLessonNotFoundError,
	ContentModuleNotFoundError,
	ContentQuizCompletesOnSubmitError,
	ContentQuizNotFoundError,
} from "../domain/content.errors";
import {
	toCourseContentTree,
	toLessonMaterial,
} from "../domain/content.mapper";
import type { ContentLesson, ContentModuleQuiz } from "../domain/content.types";
import { attemptsLeftOf, quizAvailabilityOf } from "../domain/quiz.rules";

type Dependencies = {
	classroomRepository: ICradle["classroomRepository"];
	contentRepository: ICradle["contentRepository"];
	lessonMaterialReader: ICradle["lessonMaterialReader"];
	progressSync: ICradle["progressSync"];
	quizRepository: ICradle["quizRepository"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

export const createClassroomService = ({
	classroomRepository,
	contentRepository,
	lessonMaterialReader,
	progressSync,
	quizRepository,
	runInTransaction,
	clock,
	logger,
}: Dependencies): IClassroomService => {
	const run = createOperationRunner(logger.child({ module: "content" }));

	const requireCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<ClassroomCourse> => {
		const course = await classroomRepository.findCourse(
			courseDocumentId,
			actor.userId,
		);
		if (!course) throw new ContentCourseNotFoundError();
		return course;
	};

	/**
	 * El temario con el estado de cada lección y de cada evaluación de módulo
	 * para quien lo recorre. `done` junta lo completado y lo presentado.
	 */
	const readProgress = async (course: ClassroomCourse, userId: number) => {
		const [rows, progress, attempts] = await Promise.all([
			contentRepository.findTree(course.id),
			classroomRepository.findProgress(course.id, userId),
			quizRepository.findLatestAttempts(course.id, userId),
		]);
		const tree = toCourseContentTree(rows);
		const statusOf = new Map<string, LessonProgressStatus>(
			progress.map((row) => [row.lessonDocumentId, row.status]),
		);
		const attemptOf = new Map(
			attempts.map((attempt) => [attempt.quizDocumentId, attempt]),
		);
		const done = new Set([
			...progress
				.filter((row) => row.status === "COMPLETED")
				.map((row) => row.lessonDocumentId),
			...attempts.map((attempt) => attempt.quizDocumentId),
		]);
		const withStatus = (lesson: ContentLesson): ClassroomLesson => ({
			...lesson,
			status: statusOf.get(lesson.documentId) ?? null,
		});
		const quizStatusOf = (
			quiz: ContentModuleQuiz | null,
		): ClassroomQuizStatus | null => {
			if (!quiz || quiz.questionCount === 0) return null;

			const attempt = attemptOf.get(quiz.documentId) ?? null;
			return {
				title: quiz.title,
				availability: quizAvailabilityOf(
					course,
					course.enrollment,
					attempt,
					"MODULE",
					quiz.maxAttempts,
				),
				score: attempt?.score ?? null,
				passed: attempt?.passed ?? null,
				attemptsLeft: attemptsLeftOf(quiz.maxAttempts, attempt),
			};
		};

		return { tree, done, withStatus, quizStatusOf };
	};

	/** El examen tal como lo enseña el índice del aula. */
	const readFinalQuiz = async (course: ClassroomCourse, userId: number) => {
		if (!evaluatesByQuiz(course)) return null;

		const quiz = await quizRepository.findQuiz(course.id, {
			lessonId: null,
			moduleId: null,
		});
		if (!quiz || quiz.questions.length === 0) return null;

		const attempt = await quizRepository.findAttempt(quiz.id, userId);
		return {
			title: quiz.title,
			availability: quizAvailabilityOf(
				course,
				course.enrollment,
				attempt,
				"FINAL",
				quiz.maxAttempts,
			),
			score: attempt?.score ?? null,
			passed: attempt?.passed ?? null,
			attemptsLeft: attemptsLeftOf(quiz.maxAttempts, attempt),
		};
	};

	return {
		async findClassroom(courseDocumentId: string, actor: AuthContext) {
			return run("findClassroom", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				assertClassroomReadable(course);

				const [{ tree, done, withStatus, quizStatusOf }, finalQuiz] =
					await Promise.all([
						readProgress(course, actor.userId),
						readFinalQuiz(course, actor.userId),
					]);

				return ok({
					course: {
						documentId: course.documentId,
						title: course.title,
						completionRule: course.completionRule,
						countsContent: countsContent(course.completionRule),
						readOnly: course.status !== "PUBLISHED",
					},
					modules: tree.map((module) => ({
						documentId: module.documentId,
						title: module.title,
						description: module.description,
						lessons: module.lessons.map(withStatus),
						quiz: quizStatusOf(module.quiz),
					})),
					// Se calcula en vivo: la pantalla no confía en el caché, que
					// solo existe para no tener que hacer esto en cada listado.
					percent: progressPercentOf(tree, done),
					contentCompletedAt: course.enrollment?.contentCompletedAt ?? null,
					completed: course.enrollment?.completed ?? false,
					resume: resumeStopOf(tree, done),
					finalQuiz,
				});
			});
		},

		async findLesson(
			courseDocumentId: string,
			lessonDocumentId: string,
			actor: AuthContext,
		) {
			return run("findLesson", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				assertClassroomReadable(course);

				const [{ tree, withStatus }, raw] = await Promise.all([
					readProgress(course, actor.userId),
					contentRepository.findMaterial(course.id, lessonDocumentId),
				]);
				const lesson = tree
					.flatMap((module) => module.lessons)
					.find((row) => row.documentId === lessonDocumentId);
				if (!lesson || !raw) throw new ContentLessonNotFoundError();

				const { previous, next } = neighborsOf(tree, {
					kind: "LESSON",
					documentId: lessonDocumentId,
				});

				return ok({
					lesson: withStatus(lesson),
					material: await lessonMaterialReader.sign(toLessonMaterial(raw)),
					previous,
					next,
					readOnly: course.status !== "PUBLISHED",
				});
			});
		},

		async findModuleQuiz(
			courseDocumentId: string,
			moduleDocumentId: string,
			actor: AuthContext,
		) {
			return run("findModuleQuiz", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				assertClassroomReadable(course);

				const tree = toCourseContentTree(
					await contentRepository.findTree(course.id),
				);
				const module = tree.find((row) => row.documentId === moduleDocumentId);
				if (!module) throw new ContentModuleNotFoundError();
				if (!module.quiz || module.quiz.questionCount === 0) {
					throw new ContentQuizNotFoundError();
				}

				return ok({
					moduleTitle: module.title,
					...neighborsOf(tree, {
						kind: "MODULE_QUIZ",
						documentId: moduleDocumentId,
					}),
				});
			});
		},

		async recordProgress(
			courseDocumentId: string,
			dto: RecordProgressDto,
			actor: AuthContext,
		) {
			return run("recordProgress", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				assertCanProgress(course);

				const lesson = await contentRepository.findLesson(
					course.id,
					dto.lessonDocumentId,
				);
				if (!lesson) throw new ContentLessonNotFoundError();
				if (lesson.type === "QUIZ" && dto.status === "COMPLETED") {
					const quiz = await quizRepository.findQuiz(course.id, {
						lessonId: lesson.id,
						moduleId: null,
					});
					// Una práctica sin preguntas no terminaría nunca: esa sí se marca.
					if (quiz && quiz.questions.length > 0) {
						throw new ContentQuizCompletesOnSubmitError();
					}
				}

				const now = clock.now();

				return runInTransaction(async () => {
					const stored = (
						await classroomRepository.findProgress(course.id, actor.userId)
					).find((row) => row.lessonDocumentId === dto.lessonDocumentId);
					const status = nextProgressStatus(stored?.status ?? null, dto.status);

					if (stored?.status !== status) {
						await classroomRepository.saveProgress(
							lesson.id,
							actor.userId,
							status,
							now,
						);
					}

					// Empezar una lección no mueve el porcentaje; completarla sí,
					// y puede ser la que termina el curso.
					const current = {
						percent: course.enrollment?.progressPercent ?? 0,
						contentCompleted: Boolean(course.enrollment?.contentCompletedAt),
					};
					if (status !== "COMPLETED" || stored?.status === "COMPLETED") {
						return ok(current);
					}

					const [state] = await progressSync.recalculate(
						course,
						actor.userId,
						now,
						[actor.userId],
					);

					return ok(
						state
							? {
									percent: state.percent,
									contentCompleted: state.contentCompleted,
								}
							: current,
					);
				});
			});
		},

		async listMine(actor: AuthContext) {
			return run("listMine", async () => {
				const courses = await classroomRepository.findClassroomCourses(
					actor.userId,
				);
				return ok(courses.map((course) => course.documentId));
			});
		},

		async summarizeMine(actor: AuthContext) {
			return run("summarizeMine", async () => {
				const courses = await classroomRepository.findClassroomCourses(
					actor.userId,
				);
				const userIds = [actor.userId];

				const summaries = await Promise.all(
					courses.map(async (course) => {
						const [rows, completed, presented] = await Promise.all([
							contentRepository.findTree(course.id),
							classroomRepository.findCompletedLessons(course.id, userIds),
							quizRepository.findBestScores(course.id, userIds),
						]);
						const done = new Set([
							...completed.map((row) => row.lessonDocumentId),
							...presented.map((row) => row.itemDocumentId),
						]);

						return {
							documentId: course.documentId,
							...progressCountOf(toCourseContentTree(rows), done),
						};
					}),
				);

				return ok(summaries);
			});
		},
	};
};
