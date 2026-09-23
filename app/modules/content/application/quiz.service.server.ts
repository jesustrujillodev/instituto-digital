import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { evaluatesByQuiz } from "@/modules/courses/domain/course.rules";
import { syncsOnWrite } from "@/modules/teaching/domain/teaching.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	assertCanProgress,
	assertClassroomReadable,
	nextProgressStatus,
} from "../domain/classroom.rules";
import type { ClassroomCourse } from "../domain/classroom.types";
import {
	ContentCourseNotFoundError,
	ContentLessonNotFoundError,
	ContentMaterialMismatchError,
	ContentQuizNotEvaluatedError,
	ContentQuizNotFoundError,
} from "../domain/content.errors";
import {
	assertBankEditable,
	assertCanSubmit,
	gradeAttempt,
	quizAvailabilityOf,
	toQuizBank,
	toQuizBankWrite,
	toQuizOutcome,
	toQuizSheet,
} from "../domain/quiz.rules";
import type { IQuizService } from "../domain/quiz.service";
import type {
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

	/** La lección `QUIZ` de la que cuelga la práctica; `null` es el examen. */
	const requireQuizLesson = async (
		courseId: number,
		lessonDocumentId: string | null,
	) => {
		if (lessonDocumentId === null) return null;

		const lesson = await contentRepository.findLesson(
			courseId,
			lessonDocumentId,
		);
		if (!lesson) throw new ContentLessonNotFoundError();
		if (lesson.type !== "QUIZ") {
			throw new ContentMaterialMismatchError("QUIZ", lesson.type);
		}
		return lesson;
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

	/** El examen solo existe para quien lo presenta si el curso se evalúa con él. */
	const assertFinalQuizCounts = (
		course: ClassroomCourse,
		lessonDocumentId: string | null,
	) => {
		if (lessonDocumentId === null && !evaluatesByQuiz(course)) {
			throw new ContentQuizNotEvaluatedError();
		}
	};

	return {
		async findBank(
			courseDocumentId: string,
			lessonDocumentId: string | null,
			actor: AuthContext,
		) {
			return run("findBank", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				const lesson = await requireQuizLesson(course.id, lessonDocumentId);

				const quiz = await quizRepository.findQuiz(
					course.id,
					lesson?.id ?? null,
				);
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
				const lesson = await requireQuizLesson(course.id, dto.lessonDocumentId);

				await runInTransaction(async () => {
					// Con la fila del curso bloqueada: dos guardados del examen no
					// pueden crear dos exámenes, y nadie presenta a mitad.
					await enrollmentRepository.lockCourseSeats(course.id);

					const quiz = await quizRepository.findQuiz(
						course.id,
						lesson?.id ?? null,
					);
					if (quiz)
						assertBankEditable(await quizRepository.countAttempts(quiz.id));

					await quizRepository.replaceBank(
						course.id,
						lesson?.id ?? null,
						toQuizBankWrite(dto),
					);
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
				const lesson = await requireQuizLesson(course.id, dto.lessonDocumentId);

				const quiz = await quizRepository.findQuiz(
					course.id,
					lesson?.id ?? null,
				);
				if (!quiz) throw new ContentQuizNotFoundError();

				await quizRepository.rename(quiz.id, dto.title);
				return ok(null);
			});
		},

		async findView(
			courseDocumentId: string,
			lessonDocumentId: string | null,
			actor: AuthContext,
		) {
			return run("findView", async () => {
				const course = await requireClassroomCourse(courseDocumentId, actor);
				assertClassroomReadable(course);
				if (lessonDocumentId === null && !evaluatesByQuiz(course)) {
					return ok(null);
				}
				const lesson = await requireQuizLesson(course.id, lessonDocumentId);

				const quiz = await quizRepository.findQuiz(
					course.id,
					lesson?.id ?? null,
				);
				if (!quiz || quiz.questions.length === 0) return ok(null);

				const attempt = await quizRepository.findAttempt(quiz.id, actor.userId);
				const availability = quizAvailabilityOf(
					course,
					course.enrollment?.contentCompletedAt ?? null,
					attempt,
					lesson === null,
				);

				return ok({
					availability,
					title: quiz.title,
					questionCount: quiz.questions.length,
					// Solo si ahora mismo puede presentarlo, y sin la correcta.
					sheet:
						availability === "AVAILABLE" && course.status === "PUBLISHED"
							? toQuizSheet(quiz, `${quiz.documentId}:${actor.userId}`)
							: null,
					outcome: attempt ? toQuizOutcome(quiz, attempt) : null,
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
				assertFinalQuizCounts(course, dto.lessonDocumentId);
				const lesson = await requireQuizLesson(course.id, dto.lessonDocumentId);
				const now = clock.now();

				return runInTransaction(async () => {
					await enrollmentRepository.lockCourseSeats(course.id);

					const quiz = await quizRepository.findQuiz(
						course.id,
						lesson?.id ?? null,
					);
					if (!quiz || quiz.questions.length === 0) {
						throw new ContentQuizNotFoundError();
					}

					assertCanSubmit(
						quizAvailabilityOf(
							course,
							course.enrollment?.contentCompletedAt ?? null,
							await quizRepository.findAttempt(quiz.id, actor.userId),
							lesson === null,
						),
					);

					const graded = gradeAttempt(quiz, dto.answers);
					await quizRepository.saveAttempt(quiz.id, actor.userId, graded, now);

					if (lesson) {
						// La práctica no evalúa: enviarla completa la lección, apruebe o no.
						const stored = (
							await classroomRepository.findProgress(course.id, actor.userId)
						).find((row) => row.lessonDocumentId === dto.lessonDocumentId);
						if (stored?.status !== "COMPLETED") {
							await classroomRepository.saveProgress(
								lesson.id,
								actor.userId,
								nextProgressStatus(stored?.status ?? null, "COMPLETED"),
								now,
							);
							await progressSync.recalculate(course, actor.userId, now, [
								actor.userId,
							]);
						}
					} else {
						// El examen escribe el resultado por la misma vía que la captura
						// manual, y quien lo firma es quien lo presentó.
						await enrollmentRepository.saveResults(
							course.id,
							[
								{
									userId: actor.userId,
									result: graded.passed ? "PASSED" : "FAILED",
									grade: graded.score,
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
	};
};
