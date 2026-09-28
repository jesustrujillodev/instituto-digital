import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	countsContent,
	evaluatesByQuiz,
} from "@/modules/courses/domain/course.rules";
import {
	canTeach,
	resolveTeachingScope,
	teachingCourseWhere,
} from "@/modules/teaching/domain/teaching.access";
import { syncsOnWrite } from "@/modules/teaching/domain/teaching.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	assertCanProgress,
	assertClassroomReadable,
	countedScoresOf,
	nextProgressStatus,
} from "../domain/classroom.rules";
import type { ClassroomCourse } from "../domain/classroom.types";
import {
	ContentCourseNotFoundError,
	ContentLessonNotFoundError,
	ContentMaterialMismatchError,
	ContentModuleNotFoundError,
	ContentQuizNotEvaluatedError,
	ContentQuizNotFoundError,
	ContentQuizParticipantNotFoundError,
	ContentQuizRetakeNotAllowedError,
} from "../domain/content.errors";
import { toCourseContentTree } from "../domain/content.mapper";
import type { ContentCourseRef } from "../domain/content.types";
import {
	assertBankEditable,
	assertCanSubmit,
	assertRetakeGrantable,
	attemptsLeftOf,
	canGrantRetakeOn,
	courseGradeOf,
	courseResultOf,
	gradeAttempt,
	isAccredited,
	nextAttemptNumberOf,
	type QuizKind,
	quizAvailabilityOf,
	quizKindOf,
	toQuizBank,
	toQuizBankWrite,
	toQuizOutcome,
	toQuizSheet,
} from "../domain/quiz.rules";
import type { IQuizService } from "../domain/quiz.service";
import type {
	GrantRetakeDto,
	ModuleQuizDto,
	QuizOwnerIds,
	QuizOwnerRef,
	RenameQuizDto,
	SaveQuizDto,
	SubmitQuizDto,
} from "../domain/quiz.types";
import { createContentCourseGate } from "./content-course.gate.server";

type Dependencies = {
	contentRepository: ICradle["contentRepository"];
	classroomRepository: ICradle["classroomRepository"];
	quizRepository: ICradle["quizRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	progressSync: ICradle["progressSync"];
	completionSync: ICradle["completionSync"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

/** El dueño ya resuelto a filas, con la lección si es una práctica. */
interface ResolvedOwner {
	kind: QuizKind;
	ids: QuizOwnerIds;
	lessonId: number | null;
}

export const createQuizService = ({
	contentRepository,
	classroomRepository,
	quizRepository,
	enrollmentRepository,
	progressSync,
	completionSync,
	runInTransaction,
	clock,
	logger,
}: Dependencies): IQuizService => {
	const run = createOperationRunner(logger.child({ module: "content" }));
	const { requireCourse, requireEditableCourse } =
		createContentCourseGate(contentRepository);

	/**
	 * De qué cuelga el cuestionario: una lección `QUIZ` (práctica), un módulo
	 * (su evaluación) o nada (el examen final).
	 */
	const resolveOwner = async (
		courseId: number,
		owner: QuizOwnerRef,
	): Promise<ResolvedOwner> => {
		const kind = quizKindOf(owner);

		if (kind === "PRACTICE" && owner.lessonDocumentId !== null) {
			const lesson = await contentRepository.findLesson(
				courseId,
				owner.lessonDocumentId,
			);
			if (!lesson) throw new ContentLessonNotFoundError();
			if (lesson.type !== "QUIZ") {
				throw new ContentMaterialMismatchError("QUIZ", lesson.type);
			}
			return {
				kind,
				ids: { lessonId: lesson.id, moduleId: null },
				lessonId: lesson.id,
			};
		}

		if (kind === "MODULE" && owner.moduleDocumentId !== null) {
			const module = await contentRepository.findModule(
				courseId,
				owner.moduleDocumentId,
			);
			if (!module) throw new ContentModuleNotFoundError();
			return {
				kind,
				ids: { lessonId: null, moduleId: module.id },
				lessonId: null,
			};
		}

		return { kind, ids: { lessonId: null, moduleId: null }, lessonId: null };
	};

	/** El curso visto por quien lo presenta, con su inscripción. */
	const requireClassroomCourse = async (
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

	/** El curso que el alcance imparte; sin alcance, ni siquiera se busca. */
	const requireTeachingCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	) => {
		const scope = resolveTeachingScope(actor);
		if (!canTeach(scope)) throw new ContentCourseNotFoundError();

		const course = await quizRepository.findTeachingCourse(
			courseDocumentId,
			teachingCourseWhere(scope),
		);
		if (!course) throw new ContentCourseNotFoundError();
		return course;
	};

	/**
	 * Una evaluación de módulo que aparece o desaparece mueve el porcentaje de
	 * todo inscrito, igual que una lección obligatoria (docs/adr/0016).
	 */
	const recalculateProgress = async (
		course: ContentCourseRef,
		actor: AuthContext,
		at: Date,
	) => {
		if (course.status !== "PUBLISHED") return;
		await progressSync.recalculate(course, actor.userId, at);
	};

	return {
		async findBank(
			courseDocumentId: string,
			owner: QuizOwnerRef,
			actor: AuthContext,
		) {
			return run("findBank", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				const { ids } = await resolveOwner(course.id, owner);

				const quiz = await quizRepository.findQuiz(course.id, ids);
				if (!quiz) return ok(null);

				return ok(
					toQuizBank(quiz, await quizRepository.countAttempts(quiz.id)),
				);
			});
		},

		async saveBank(
			courseDocumentId: string,
			dto: SaveQuizDto,
			actor: AuthContext,
		) {
			return run("saveBank", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const { kind, ids } = await resolveOwner(course.id, dto);

				await runInTransaction(async () => {
					// Con la fila del curso bloqueada: dos guardados no pueden crear
					// dos cuestionarios para el mismo dueño, y nadie presenta a mitad.
					await enrollmentRepository.lockCourseSeats(course.id);

					const quiz = await quizRepository.findQuiz(course.id, ids);
					if (quiz)
						assertBankEditable(await quizRepository.countAttempts(quiz.id));

					await quizRepository.replaceBank(
						course.id,
						ids,
						toQuizBankWrite(dto),
					);

					if (!quiz && kind === "MODULE") {
						await recalculateProgress(course, actor, clock.now());
					}
				});

				return ok(null);
			});
		},

		async renameQuiz(
			courseDocumentId: string,
			dto: RenameQuizDto,
			actor: AuthContext,
		) {
			return run("renameQuiz", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const { ids } = await resolveOwner(course.id, dto);

				const quiz = await quizRepository.findQuiz(course.id, ids);
				if (!quiz) throw new ContentQuizNotFoundError();

				await quizRepository.rename(quiz.id, dto.title);
				return ok(null);
			});
		},

		async archiveModuleQuiz(
			courseDocumentId: string,
			dto: ModuleQuizDto,
			actor: AuthContext,
		) {
			return run("archiveModuleQuiz", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const { ids } = await resolveOwner(course.id, {
					lessonDocumentId: null,
					moduleDocumentId: dto.moduleDocumentId,
				});
				const now = clock.now();

				await runInTransaction(async () => {
					await enrollmentRepository.lockCourseSeats(course.id);

					const quiz = await quizRepository.findQuiz(course.id, ids);
					if (!quiz) throw new ContentQuizNotFoundError();

					// Archivarla puede completar a quien solo la debía a ella.
					await quizRepository.archive(quiz.id, now);
					await recalculateProgress(course, actor, now);
				});

				return ok(null);
			});
		},

		async findView(
			courseDocumentId: string,
			owner: QuizOwnerRef,
			actor: AuthContext,
		) {
			return run("findView", async () => {
				const course = await requireClassroomCourse(courseDocumentId, actor);
				assertClassroomReadable(course);
				const kind = quizKindOf(owner);
				if (kind === "FINAL" && !evaluatesByQuiz(course)) return ok(null);
				const { ids } = await resolveOwner(course.id, owner);

				const quiz = await quizRepository.findQuiz(course.id, ids);
				if (!quiz || quiz.questions.length === 0) return ok(null);

				const attempt = await quizRepository.findAttempt(quiz.id, actor.userId);
				const availability = quizAvailabilityOf(
					course,
					course.enrollment,
					attempt,
					kind,
					quiz.maxAttempts,
				);

				return ok({
					availability,
					title: quiz.title,
					questionCount: quiz.questions.length,
					// Solo si ahora mismo puede presentarlo, y sin la correcta.
					sheet:
						availability === "AVAILABLE" && course.status === "PUBLISHED"
							? toQuizSheet(
									quiz,
									`${quiz.documentId}:${actor.userId}`,
									attemptsLeftOf(quiz.maxAttempts, attempt),
								)
							: null,
					outcome: attempt ? toQuizOutcome(quiz, attempt) : null,
					canRequestRetake:
						course.status === "PUBLISHED" &&
						!(course.enrollment && isAccredited(course.enrollment)) &&
						canGrantRetakeOn(attempt, quiz.maxAttempts),
				});
			});
		},

		async submit(
			courseDocumentId: string,
			dto: SubmitQuizDto,
			actor: AuthContext,
		) {
			return run("submit", async () => {
				const course = await requireClassroomCourse(courseDocumentId, actor);
				assertCanProgress(course);
				const kind = quizKindOf(dto);
				if (kind === "FINAL" && !evaluatesByQuiz(course)) {
					throw new ContentQuizNotEvaluatedError();
				}
				const { ids, lessonId } = await resolveOwner(course.id, dto);
				const now = clock.now();

				return runInTransaction(async () => {
					await enrollmentRepository.lockCourseSeats(course.id);

					const quiz = await quizRepository.findQuiz(course.id, ids);
					if (!quiz || quiz.questions.length === 0) {
						throw new ContentQuizNotFoundError();
					}

					const latest = await quizRepository.findAttempt(
						quiz.id,
						actor.userId,
					);
					assertCanSubmit(
						quizAvailabilityOf(
							course,
							course.enrollment,
							latest,
							kind,
							quiz.maxAttempts,
						),
					);

					const graded = gradeAttempt(quiz, dto.answers);
					await quizRepository.saveAttempt(
						quiz.id,
						actor.userId,
						nextAttemptNumberOf(latest),
						graded,
						now,
					);

					if (kind !== "FINAL") {
						// Cualquier intento cuenta como presentado: la práctica completa
						// su lección aunque se repruebe, y la nota entra al promedio
						// (docs/adr/0024). Recalcular siempre, porque una mejor nota
						// puede acreditar el curso aunque el avance no se mueva.
						if (lessonId !== null) {
							const stored = (
								await classroomRepository.findProgress(course.id, actor.userId)
							).find((row) => row.lessonDocumentId === dto.lessonDocumentId);
							if (stored?.status !== "COMPLETED") {
								await classroomRepository.saveProgress(
									lessonId,
									actor.userId,
									nextProgressStatus(stored?.status ?? null, "COMPLETED"),
									now,
								);
							}
						}
						await progressSync.recalculate(course, actor.userId, now, [
							actor.userId,
						]);
					} else {
						// El examen escribe el resultado por la misma vía que la captura
						// manual, y quien lo firma es quien lo presentó. La nota es el
						// promedio de las mejores con las del temario, y acredita la
						// mínima del curso (docs/adr/0021, 0024).
						const contentScores = countsContent(course.completionRule)
							? countedScoresOf(
									toCourseContentTree(
										await contentRepository.findTree(course.id),
									),
									await quizRepository.findBestScores(course.id, [
										actor.userId,
									]),
								)
							: [];
						// Ya incluye el intento recién guardado.
						const bestExam =
							(await quizRepository.findBestScore(quiz.id, actor.userId)) ??
							graded.score;
						const grade =
							courseGradeOf([...contentScores, bestExam]) ?? bestExam;
						await enrollmentRepository.saveResults(
							course.id,
							[
								{
									userId: actor.userId,
									result: courseResultOf(grade, course.minPassingGrade),
									grade,
								},
							],
							actor.userId,
							now,
						);
						if (syncsOnWrite(course)) {
							await completionSync.sync(course.id, actor.userId, now);
						}
					}

					return ok(
						toQuizOutcome(quiz, {
							submittedAt: now,
							score: graded.score,
							passed: graded.passed,
							answers: graded.answers,
						}),
					);
				});
			});
		},

		async findQuizBoard(courseDocumentId: string, actor: AuthContext) {
			return run("findQuizBoard", async () => {
				const course = await requireTeachingCourse(courseDocumentId, actor);

				const [quizzes, attempts] = await Promise.all([
					quizRepository.findBoardQuizzes(course.id),
					quizRepository.findLatestAttempts(course.id),
				]);

				return ok({
					canGrantRetake: course.status === "PUBLISHED",
					quizzes,
					attempts,
				});
			});
		},

		async grantRetake(
			courseDocumentId: string,
			dto: GrantRetakeDto,
			actor: AuthContext,
		) {
			return run("grantRetake", async () => {
				const course = await requireTeachingCourse(courseDocumentId, actor);
				// Fuera de un curso en curso nadie podría presentarlo.
				if (course.status !== "PUBLISHED") {
					throw new ContentQuizRetakeNotAllowedError();
				}
				const { ids } = await resolveOwner(course.id, dto);

				const [quiz, participant] = await Promise.all([
					quizRepository.findQuiz(course.id, ids),
					quizRepository.findEnrolledParticipant(course.id, dto.userDocumentId),
				]);
				if (!quiz) throw new ContentQuizNotFoundError();
				if (!participant) throw new ContentQuizParticipantNotFoundError();
				// Ya acreditado, la nota quedó fija: otro intento no la movería.
				if (isAccredited(participant)) {
					throw new ContentQuizRetakeNotAllowedError();
				}

				const attempt = assertRetakeGrantable(
					await quizRepository.findAttempt(quiz.id, participant.userId),
					quiz.maxAttempts,
				);
				await quizRepository.grantRetake(attempt.id, actor.userId, clock.now());

				return ok(null);
			});
		},
	};
};
