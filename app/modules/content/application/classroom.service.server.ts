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
	progressPercentOf,
	resumeLessonOf,
} from "../domain/classroom.rules";
import type { IClassroomService } from "../domain/classroom.service";
import type {
	ClassroomCourse,
	ClassroomLesson,
	RecordProgressDto,
} from "../domain/classroom.types";
import {
	ContentCourseNotFoundError,
	ContentLessonNotFoundError,
	ContentQuizCompletesOnSubmitError,
} from "../domain/content.errors";
import {
	toCourseContentTree,
	toLessonMaterial,
} from "../domain/content.mapper";
import type { ContentLesson } from "../domain/content.types";
import { quizAvailabilityOf } from "../domain/quiz.rules";

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

	/** El temario con el estado de cada lección para quien lo recorre. */
	const readProgress = async (course: ClassroomCourse, userId: number) => {
		const [rows, progress] = await Promise.all([
			contentRepository.findTree(course.id),
			classroomRepository.findProgress(course.id, userId),
		]);
		const tree = toCourseContentTree(rows);
		const statusOf = new Map<string, LessonProgressStatus>(
			progress.map((row) => [row.lessonDocumentId, row.status]),
		);
		const completed = new Set(
			progress
				.filter((row) => row.status === "COMPLETED")
				.map((row) => row.lessonDocumentId),
		);
		const withStatus = (lesson: ContentLesson): ClassroomLesson => ({
			...lesson,
			status: statusOf.get(lesson.documentId) ?? null,
		});

		return { tree, completed, withStatus };
	};

	/** El examen tal como lo enseña el índice del aula. */
	const readFinalQuiz = async (course: ClassroomCourse, userId: number) => {
		if (!evaluatesByQuiz(course)) return null;

		const quiz = await quizRepository.findQuiz(course.id, null);
		if (!quiz || quiz.questions.length === 0) return null;

		const attempt = await quizRepository.findAttempt(quiz.id, userId);
		return {
			title: quiz.title,
			availability: quizAvailabilityOf(
				course,
				course.enrollment?.contentCompletedAt ?? null,
				attempt,
				true,
			),
			score: attempt?.score ?? null,
			passed: attempt?.passed ?? null,
		};
	};

	return {
		async findClassroom(courseDocumentId: string, actor: AuthContext) {
			return run("findClassroom", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				assertClassroomReadable(course);

				const [{ tree, completed, withStatus }, finalQuiz] = await Promise.all([
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
					})),
					// Se calcula en vivo: la pantalla no confía en el caché, que
					// solo existe para no tener que hacer esto en cada listado.
					percent: progressPercentOf(tree, completed),
					contentCompletedAt: course.enrollment?.contentCompletedAt ?? null,
					completed: course.enrollment?.completed ?? false,
					resumeLessonDocumentId: resumeLessonOf(tree, completed),
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

				const { tree, withStatus } = await readProgress(course, actor.userId);
				const lesson = tree
					.flatMap((module) => module.lessons)
					.find((row) => row.documentId === lessonDocumentId);
				if (!lesson) throw new ContentLessonNotFoundError();

				const raw = await contentRepository.findMaterial(
					course.id,
					lessonDocumentId,
				);
				if (!raw) throw new ContentLessonNotFoundError();

				const { previous, next } = neighborsOf(tree, lessonDocumentId);

				return ok({
					lesson: withStatus(lesson),
					material: await lessonMaterialReader.sign(toLessonMaterial(raw)),
					previousLessonDocumentId: previous,
					nextLessonDocumentId: next,
					readOnly: course.status !== "PUBLISHED",
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
					const quiz = await quizRepository.findQuiz(course.id, lesson.id);
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
			return run("listMine", async () =>
				ok(await classroomRepository.findClassroomCourses(actor.userId)),
			);
		},
	};
};
