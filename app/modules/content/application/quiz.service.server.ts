import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	evaluatesByQuiz,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import {
	canTeach,
	resolveTeachingScope,
	teachingCourseWhere,
} from "@/modules/teaching/domain/teaching.access";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	assertCanProgress,
	assertClassroomReadable,
	nextProgressStatus,
} from "../domain/classroom.rules";
import type { ClassroomCourse } from "../domain/classroom.types";
import { FOLLOW_UPS_PER_COURSE_LIMIT } from "../domain/content.config";
import {
	ContentCourseNotFoundError,
	ContentFollowUpClosedError,
	ContentFollowUpHasAttemptsError,
	ContentFollowUpNotFoundError,
	ContentFollowUpNotManualError,
	ContentFollowUpNotOpenError,
	ContentFollowUpSelfPacedError,
	ContentLessonNotFoundError,
	ContentMaterialMismatchError,
	ContentModuleNotFoundError,
	ContentQuizLockedError,
	ContentQuizNotEvaluatedError,
	ContentQuizNotFoundError,
	ContentQuizParticipantNotFoundError,
	ContentQuizRetakeNotAllowedError,
	ContentSessionNotFoundError,
	ContentTooManyFollowUpsError,
} from "../domain/content.errors";
import type { ContentCourseRef } from "../domain/content.types";
import {
	assertBankEditable,
	assertCanSubmit,
	assertRetakeGrantable,
	attemptsLeftOf,
	canGrantRetakeOn,
	followUpAvailabilityOf,
	followUpStateOf,
	followUpWindowOf,
	gradeAttempt,
	isAccredited,
	nextAttemptNumberOf,
	type QuizKind,
	quizAvailabilityOf,
	quizKindOf,
	toFollowUpSettingsWrite,
	toQuizBank,
	toQuizBankWrite,
	toQuizOutcome,
	toQuizSheet,
} from "../domain/quiz.rules";
import type { IQuizService } from "../domain/quiz.service";
import type {
	FollowUpDto,
	FollowUpView,
	GrantRetakeDto,
	ModuleQuizDto,
	QuizOwnerIds,
	QuizOwnerRef,
	RenameQuizDto,
	SaveFollowUpDto,
	SaveFollowUpQuestionsDto,
	SaveQuizDto,
	StoredAttempt,
	StoredFollowUp,
	SubmitQuizDto,
} from "../domain/quiz.types";
import { createContentCourseGate } from "./content-course.gate.server";

type Dependencies = {
	contentRepository: ICradle["contentRepository"];
	classroomRepository: ICradle["classroomRepository"];
	quizRepository: ICradle["quizRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	teachingRepository: ICradle["teachingRepository"];
	progressSync: ICradle["progressSync"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

/** El dueño ya resuelto a filas, con la lección si es una práctica. */
interface ResolvedOwner {
	kind: QuizKind;
	ids: QuizOwnerIds;
	lessonId: number | null;
	followUp?: StoredFollowUp;
}

export const createQuizService = ({
	contentRepository,
	classroomRepository,
	quizRepository,
	enrollmentRepository,
	teachingRepository,
	progressSync,
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

		if (kind === "FOLLOW_UP" && owner.followUpDocumentId) {
			const followUp = await quizRepository.findFollowUp(
				courseId,
				owner.followUpDocumentId,
			);
			if (!followUp) throw new ContentFollowUpNotFoundError();
			return {
				kind,
				ids: { lessonId: null, moduleId: null, followUpId: followUp.id },
				lessonId: null,
				followUp,
			};
		}

		return { kind, ids: { lessonId: null, moduleId: null }, lessonId: null };
	};

	/** El seguimiento del curso, o el error de este módulo si no es suyo. */
	const requireFollowUp = async (courseId: number, documentId: string) => {
		const followUp = await quizRepository.findFollowUp(courseId, documentId);
		if (!followUp) throw new ContentFollowUpNotFoundError();
		return followUp;
	};

	const requireSession = async (courseId: number, documentId: string) => {
		const sessionId = await quizRepository.findSessionId(courseId, documentId);
		if (sessionId === null) throw new ContentSessionNotFoundError();
		return sessionId;
	};

	const windowStateOf = (
		followUp: StoredFollowUp,
		courseStatus: Parameters<typeof followUpStateOf>[1],
		now: Date,
	) => {
		const window = followUpWindowOf(followUp, followUp.session);
		return { ...window, state: followUpStateOf(window, courseStatus, now) };
	};

	const toFollowUpView = (
		followUp: StoredFollowUp,
		courseStatus: Parameters<typeof followUpStateOf>[1],
		now: Date,
	): FollowUpView => ({
		documentId: followUp.documentId,
		title: followUp.title,
		sessionDocumentId: followUp.session.documentId,
		countsTowardGrade: followUp.countsTowardGrade,
		availability: followUp.availability,
		opensBeforeMinutes: followUp.opensBeforeMinutes,
		closesAfterMinutes: followUp.closesAfterMinutes,
		passingScore: followUp.passingScore,
		maxAttempts: followUp.maxAttempts,
		shuffleQuestions: followUp.shuffleQuestions,
		questionCount: followUp.questionCount,
		attemptCount: followUp.attemptCount,
		...windowStateOf(followUp, courseStatus, now),
	});

	/** Lo que el participante puede hacer con una evaluación de seguimiento. */
	const followUpAvailabilityFor = async (
		course: ClassroomCourse,
		followUp: StoredFollowUp,
		latestAttempt: StoredAttempt | null,
		userId: number,
		now: Date,
	) => {
		const attended = await teachingRepository.findAttendedSessionIds(
			course.id,
			userId,
		);
		return followUpAvailabilityOf(
			windowStateOf(followUp, course.status, now).state,
			attended.includes(followUp.session.id),
			course.enrollment,
			latestAttempt,
			followUp.maxAttempts,
		);
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
					followUpDocumentId: null,
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
				const { ids, followUp } = await resolveOwner(course.id, owner);

				const quiz = await quizRepository.findQuiz(course.id, ids);
				if (!quiz || quiz.questions.length === 0) return ok(null);

				const attempt = await quizRepository.findAttempt(quiz.id, actor.userId);
				const availability = followUp
					? await followUpAvailabilityFor(
							course,
							followUp,
							attempt,
							actor.userId,
							clock.now(),
						)
					: quizAvailabilityOf(
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
				const { ids, lessonId, followUp } = await resolveOwner(course.id, dto);
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
						followUp
							? await followUpAvailabilityFor(
									course,
									followUp,
									latest,
									actor.userId,
									now,
								)
							: quizAvailabilityOf(
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

					// Cualquier intento cuenta como presentado: la práctica completa
					// su lección aunque se repruebe (docs/adr/0024).
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
					// La nota se recalcula con cualquier envío: una mejor nota puede
					// acreditar aunque el avance no se mueva. El examen escribe el
					// resultado por la misma vía, y quien lo firma es quien lo presentó.
					await progressSync.recalculate(course, actor.userId, now, [
						actor.userId,
					]);

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

		async findFollowUps(courseDocumentId: string, actor: AuthContext) {
			return run("findFollowUps", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				const now = clock.now();

				const followUps = await quizRepository.findFollowUps(course.id);
				return ok(
					followUps.map((followUp) =>
						toFollowUpView(followUp, course.status, now),
					),
				);
			});
		},

		async saveFollowUp(
			courseDocumentId: string,
			dto: SaveFollowUpDto,
			actor: AuthContext,
		) {
			return run("saveFollowUp", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				if (!requiresSessions(course.format)) {
					throw new ContentFollowUpSelfPacedError();
				}
				const sessionId = await requireSession(
					course.id,
					dto.sessionDocumentId,
				);
				const write = {
					title: dto.title,
					sessionId,
					passingScore: dto.passingScore,
					maxAttempts: dto.maxAttempts,
					shuffleQuestions: dto.shuffleQuestions,
					...toFollowUpSettingsWrite(dto),
				};

				const documentId = await runInTransaction(async () => {
					// Con la fila del curso bloqueada: nadie presenta a mitad y dos
					// altas no rebasan el tope.
					await enrollmentRepository.lockCourseSeats(course.id);

					if (!dto.followUpDocumentId) {
						const existing = await quizRepository.findFollowUps(course.id);
						if (existing.length >= FOLLOW_UPS_PER_COURSE_LIMIT) {
							throw new ContentTooManyFollowUpsError(
								FOLLOW_UPS_PER_COURSE_LIMIT,
							);
						}
						// Nace sin preguntas: se escriben al guardar el paso.
						const created = await quizRepository.createFollowUp(
							course.id,
							write,
						);
						return created.documentId;
					}

					const followUp = await requireFollowUp(
						course.id,
						dto.followUpDocumentId,
					);
					// Con intentos, lo que mide las notas se congela como en cualquier
					// banco, y cambiar de sesión o si cuenta mediría distinto las ya
					// dadas. El nombre y la ventana sí se corrigen.
					if (
						followUp.attemptCount > 0 &&
						(sessionId !== followUp.session.id ||
							write.countsTowardGrade !== followUp.countsTowardGrade ||
							write.passingScore !== followUp.passingScore ||
							write.maxAttempts !== followUp.maxAttempts ||
							write.shuffleQuestions !== followUp.shuffleQuestions)
					) {
						throw new ContentQuizLockedError();
					}
					await quizRepository.updateFollowUp(followUp.id, write);
					return followUp.documentId;
				});

				return ok({ documentId });
			});
		},

		async saveFollowUpQuestions(
			courseDocumentId: string,
			dto: SaveFollowUpQuestionsDto,
			actor: AuthContext,
		) {
			return run("saveFollowUpQuestions", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);

				await runInTransaction(async () => {
					await enrollmentRepository.lockCourseSeats(course.id);

					const followUp = await requireFollowUp(
						course.id,
						dto.followUpDocumentId,
					);
					assertBankEditable(followUp.attemptCount);
					// Los datos del cuestionario los pone el modal: aquí solo cambian
					// las preguntas.
					await quizRepository.replaceBank(
						course.id,
						{ lessonId: null, moduleId: null, followUpId: followUp.id },
						toQuizBankWrite({
							title: followUp.title,
							passingScore: followUp.passingScore,
							maxAttempts: followUp.maxAttempts,
							shuffleQuestions: followUp.shuffleQuestions,
							questions: dto.questions,
						}),
					);
				});

				return ok(null);
			});
		},

		async removeFollowUp(
			courseDocumentId: string,
			dto: FollowUpDto,
			actor: AuthContext,
		) {
			return run("removeFollowUp", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);

				await runInTransaction(async () => {
					await enrollmentRepository.lockCourseSeats(course.id);

					const followUp = await requireFollowUp(
						course.id,
						dto.followUpDocumentId,
					);
					if (followUp.attemptCount > 0) {
						throw new ContentFollowUpHasAttemptsError();
					}
					await quizRepository.deleteFollowUp(followUp.id);
				});

				return ok(null);
			});
		},

		async openFollowUp(
			courseDocumentId: string,
			dto: FollowUpDto,
			actor: AuthContext,
		) {
			return run("openFollowUp", async () => {
				const course = await requireTeachingCourse(courseDocumentId, actor);
				if (course.status !== "PUBLISHED")
					throw new ContentFollowUpClosedError();

				const followUp = await requireFollowUp(
					course.id,
					dto.followUpDocumentId,
				);
				if (followUp.availability !== "MANUAL") {
					throw new ContentFollowUpNotManualError();
				}
				if (followUp.closedAt) throw new ContentFollowUpClosedError();
				if (followUp.openedAt) return ok(null);

				await quizRepository.openFollowUp(followUp.id, clock.now());
				return ok(null);
			});
		},

		async closeFollowUp(
			courseDocumentId: string,
			dto: FollowUpDto,
			actor: AuthContext,
		) {
			return run("closeFollowUp", async () => {
				const course = await requireTeachingCourse(courseDocumentId, actor);
				if (course.status !== "PUBLISHED")
					throw new ContentFollowUpClosedError();
				const now = clock.now();

				await runInTransaction(async () => {
					await enrollmentRepository.lockCourseSeats(course.id);

					const followUp = await requireFollowUp(
						course.id,
						dto.followUpDocumentId,
					);
					if (followUp.availability !== "MANUAL") {
						throw new ContentFollowUpNotManualError();
					}
					if (followUp.closedAt) throw new ContentFollowUpClosedError();
					if (!followUp.openedAt) throw new ContentFollowUpNotOpenError();

					await quizRepository.closeFollowUp(followUp.id, now);
					// Quien no la presentó y cuenta acaba de sacar 0.
					if (followUp.countsTowardGrade) {
						await progressSync.recalculate(course, actor.userId, now);
					}
				});

				return ok(null);
			});
		},

		async findFollowUpBoard(courseDocumentId: string, actor: AuthContext) {
			return run("findFollowUpBoard", async () => {
				const course = await requireTeachingCourse(courseDocumentId, actor);
				const now = clock.now();

				const [followUps, scores] = await Promise.all([
					quizRepository.findFollowUps(course.id),
					quizRepository.findFollowUpBestScores(course.id),
				]);

				return ok({
					canToggle: course.status === "PUBLISHED",
					followUps: followUps.map((followUp) =>
						toFollowUpView(followUp, course.status, now),
					),
					scores: scores.map(({ quizDocumentId, userDocumentId, score }) => ({
						quizDocumentId,
						userDocumentId,
						score,
					})),
				});
			});
		},

		async findParticipantFollowUps(
			courseDocumentId: string,
			actor: AuthContext,
			sessionDocumentId?: string,
		) {
			return run("findParticipantFollowUps", async () => {
				const course = await classroomRepository.findCourse(
					courseDocumentId,
					actor.userId,
				);
				// Como el material de las sesiones: sin inscripción vigente o sin
				// sesiones, no hay nada que enseñar.
				if (
					course?.enrollment?.status !== "ENROLLED" ||
					(course.status !== "PUBLISHED" && course.status !== "FINISHED") ||
					!requiresSessions(course.format)
				) {
					return ok([]);
				}
				const now = clock.now();

				const [followUps, attended, scores] = await Promise.all([
					quizRepository.findFollowUps(course.id),
					teachingRepository.findAttendedSessionIds(course.id, actor.userId),
					quizRepository.findFollowUpBestScores(course.id, [actor.userId]),
				]);
				const bestOf = new Map(scores.map((row) => [row.quizId, row.score]));
				const presentable = followUps.filter(
					(followUp) =>
						followUp.questionCount > 0 &&
						(sessionDocumentId === undefined ||
							followUp.session.documentId === sessionDocumentId),
				);

				const entries = await Promise.all(
					presentable.map(async (followUp) => {
						const latest = await quizRepository.findAttempt(
							followUp.id,
							actor.userId,
						);
						const { opensAt, closesAt, state } = windowStateOf(
							followUp,
							course.status,
							now,
						);
						return {
							documentId: followUp.documentId,
							title: followUp.title,
							sessionDocumentId: followUp.session.documentId,
							countsTowardGrade: followUp.countsTowardGrade,
							questionCount: followUp.questionCount,
							opensAt,
							closesAt,
							availability: followUpAvailabilityOf(
								state,
								attended.includes(followUp.session.id),
								course.enrollment,
								latest,
								followUp.maxAttempts,
							),
							best: bestOf.get(followUp.id) ?? null,
							attemptsLeft: attemptsLeftOf(followUp.maxAttempts, latest),
						};
					}),
				);

				return ok(entries);
			});
		},
	};
};
