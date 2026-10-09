import { Prisma } from "@prisma/client";
import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type { ICradle } from "@/shared/di/container.types";
import { ContentQuizAlreadyTakenError } from "../domain/content.errors";
import type { IQuizRepository } from "../domain/quiz.repository";
import { quizKindOf } from "../domain/quiz.rules";
import type {
	FollowUpScoreRow,
	QuizAttemptRow,
	QuizBoardEntry,
	QuizOwnerIds,
	QuizScoreRow,
	StoredAttempt,
	StoredFollowUp,
	StoredQuiz,
} from "../domain/quiz.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const ACTIVE = { archivedAt: null } as const;

const asCourseWhere = (where: TeachingCourseWhere) =>
	where as unknown as Prisma.CourseWhereInput;

/** El examen final: sin lección, módulo ni sesión. */
const FINAL_QUIZ = { lessonId: null, moduleId: null, sessionId: null } as const;

/** El cuestionario activo de ese dueño; el seguimiento se busca por su fila. */
const ownerWhere = (courseId: number, owner: QuizOwnerIds) =>
	owner.followUpId
		? { courseId, id: owner.followUpId }
		: {
				courseId,
				lessonId: owner.lessonId,
				moduleId: owner.moduleId,
				sessionId: null,
				...ACTIVE,
			};

/** Un cuestionario de módulo cuenta mientras él y su módulo sigan activos. */
const activeModuleQuizOf = (courseId: number) => ({
	courseId,
	...ACTIVE,
	module: { courseId, ...ACTIVE },
});

/** Lo que se presenta: prácticas y módulos activos, seguimiento y examen final. */
const presentableQuizOf = (courseId: number) => ({
	courseId,
	...ACTIVE,
	questions: { some: {} },
	OR: [
		{ lesson: { ...ACTIVE, module: { courseId, ...ACTIVE } } },
		{ module: { courseId, ...ACTIVE } },
		{ session: { courseId } },
		FINAL_QUIZ,
	],
});

const FOLLOW_UP_SELECT = {
	id: true,
	documentId: true,
	title: true,
	passingScore: true,
	maxAttempts: true,
	shuffleQuestions: true,
	countsTowardGrade: true,
	availability: true,
	opensBeforeMinutes: true,
	closesAfterMinutes: true,
	openedAt: true,
	closedAt: true,
	session: {
		select: { id: true, documentId: true, startsAt: true, endsAt: true },
	},
	_count: { select: { questions: true, attempts: true } },
} satisfies Prisma.QuizSelect;

type FollowUpRow = Prisma.QuizGetPayload<{ select: typeof FOLLOW_UP_SELECT }>;

/** Las columnas del seguimiento solo son nulas fuera de él. */
const toStoredFollowUps = (rows: readonly FollowUpRow[]): StoredFollowUp[] =>
	rows.flatMap(({ session, _count, ...row }) =>
		session
			? [
					{
						...row,
						countsTowardGrade: row.countsTowardGrade ?? false,
						availability: row.availability ?? "MANUAL",
						session,
						questionCount: _count.questions,
						attemptCount: _count.attempts,
					},
				]
			: [],
	);

const ATTEMPT_SELECT = {
	id: true,
	number: true,
	submittedAt: true,
	score: true,
	passed: true,
	retakeGrantedAt: true,
	answers: {
		select: { questionId: true, optionId: true, isCorrect: true },
	},
} satisfies Prisma.QuizAttemptSelect;

const QUIZ_SELECT = {
	id: true,
	documentId: true,
	title: true,
	passingScore: true,
	maxAttempts: true,
	shuffleQuestions: true,
	questions: {
		orderBy: { order: "asc" },
		select: {
			id: true,
			documentId: true,
			statement: true,
			type: true,
			points: true,
			options: {
				orderBy: { order: "asc" },
				select: { id: true, documentId: true, text: true, isCorrect: true },
			},
		},
	},
} satisfies Prisma.QuizSelect;

export const createQuizRepository = ({
	prisma,
}: Dependencies): IQuizRepository => ({
	async findQuiz(courseId, owner): Promise<StoredQuiz | null> {
		return prisma.quiz.findFirst({
			where: ownerWhere(courseId, owner),
			select: QUIZ_SELECT,
		});
	},

	async findQuizWithAttemptCount(courseId, owner) {
		const row = await prisma.quiz.findFirst({
			where: ownerWhere(courseId, owner),
			select: { ...QUIZ_SELECT, _count: { select: { attempts: true } } },
		});
		if (!row) return null;

		const { _count, ...quiz } = row;
		return { ...quiz, attemptCount: _count.attempts };
	},

	async replaceBank(courseId, owner, bank, existingId) {
		const scalars = {
			title: bank.title,
			passingScore: bank.passingScore,
			maxAttempts: bank.maxAttempts,
			shuffleQuestions: bank.shuffleQuestions,
		};

		const quizId =
			existingId !== null
				? (
						await prisma.quiz.update({
							where: { id: existingId },
							data: scalars,
						})
					).id
				: (
						await prisma.quiz.create({
							data: {
								courseId,
								lessonId: owner.lessonId,
								moduleId: owner.moduleId,
								...scalars,
							},
						})
					).id;

		// Borrar y recrear es seguro solo porque el banco no tiene intentos: el
		// servicio lo comprueba antes, dentro de la misma transacción.
		await prisma.quizQuestion.deleteMany({ where: { quizId } });
		if (bank.questions.length === 0) return;

		// Preguntas y opciones en dos sentencias, no en una por pregunta. Las
		// opciones se cuelgan de su pregunta por `order`, único dentro del quiz.
		const created = await prisma.quizQuestion.createManyAndReturn({
			data: bank.questions.map((question, index) => ({
				quizId,
				statement: question.statement,
				type: question.type,
				points: question.points,
				order: index + 1,
			})),
			select: { id: true, order: true },
		});
		const questionIdOf = new Map(created.map((row) => [row.order, row.id]));

		const options = bank.questions.flatMap((question, index) => {
			const questionId = questionIdOf.get(index + 1);
			if (questionId === undefined) {
				throw new Error(`pregunta ${index + 1} sin crear al guardar el banco`);
			}
			return question.options.map((option, position) => ({
				questionId,
				text: option.text,
				isCorrect: option.isCorrect,
				order: position + 1,
			}));
		});
		if (options.length > 0) {
			await prisma.quizOption.createMany({ data: options });
		}
	},

	async rename(quizId, title) {
		await prisma.quiz.update({ where: { id: quizId }, data: { title } });
	},

	async deleteQuiz(quizId) {
		await prisma.quiz.delete({ where: { id: quizId } });
	},

	async findAttempt(quizId, userId) {
		return prisma.quizAttempt.findFirst({
			where: { quizId, userId },
			orderBy: { number: "desc" },
			select: ATTEMPT_SELECT,
		});
	},

	async findLatestFollowUpAttempts(courseId, userId) {
		// El mismo filtro que `findFollowUps`: así viaja junto a él y no después.
		const rows = await prisma.quizAttempt.findMany({
			where: { userId, quiz: { courseId, sessionId: { not: null } } },
			orderBy: { number: "desc" },
			select: { quizId: true, ...ATTEMPT_SELECT },
		});

		// Del más reciente al más antiguo: el primero de cada quiz es el último.
		const latest = new Map<number, StoredAttempt>();
		for (const { quizId, ...attempt } of rows) {
			if (!latest.has(quizId)) latest.set(quizId, attempt);
		}
		return latest;
	},

	async findBestScore(quizId, userId) {
		const best = await prisma.quizAttempt.aggregate({
			where: { quizId, userId },
			_max: { score: true },
		});
		return best._max.score;
	},

	async saveAttempt(quizId, userId, number, attempt, at) {
		try {
			await prisma.quizAttempt.create({
				data: {
					quizId,
					userId,
					number,
					submittedAt: at,
					score: attempt.score,
					passed: attempt.passed,
					answers: {
						create: attempt.answers.map((answer) => ({
							questionId: answer.questionId,
							optionId: answer.optionId,
							isCorrect: answer.isCorrect,
						})),
					},
				},
			});
		} catch (error) {
			// Dos envíos simultáneos: el segundo choca con la unicidad.
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new ContentQuizAlreadyTakenError();
			}
			throw error;
		}
	},

	async grantRetake(attemptId, actorId, at) {
		await prisma.quizAttempt.update({
			where: { id: attemptId },
			data: { retakeGrantedAt: at, retakeGrantedById: actorId },
		});
	},

	async findBestScores(courseId, userIds) {
		const rows = await prisma.quizAttempt.findMany({
			where: {
				quiz: {
					OR: [
						activeModuleQuizOf(courseId),
						{ courseId, lessonId: { not: null } },
					],
				},
				...(userIds ? { userId: { in: [...userIds] } } : {}),
			},
			select: {
				userId: true,
				score: true,
				quiz: {
					select: {
						documentId: true,
						lesson: { select: { documentId: true } },
					},
				},
			},
		});

		const best = new Map<
			string,
			{ userId: number; itemDocumentId: string; score: number }
		>();
		for (const row of rows) {
			const itemDocumentId = row.quiz.lesson?.documentId ?? row.quiz.documentId;
			const key = `${itemDocumentId}:${row.userId}`;
			const current = best.get(key);
			if (!current || row.score > current.score) {
				best.set(key, { userId: row.userId, itemDocumentId, score: row.score });
			}
		}

		return [...best.values()];
	},

	async findBestScoresIn(courseIds, userIds) {
		const byCourse = new Map<number, QuizScoreRow[]>(
			courseIds.map((courseId) => [courseId, []]),
		);
		if (courseIds.length === 0) return byCourse;

		const ids = [...courseIds];
		const rows = await prisma.quizAttempt.findMany({
			where: {
				quiz: {
					courseId: { in: ids },
					OR: [
						{ ...ACTIVE, module: { courseId: { in: ids }, ...ACTIVE } },
						{ lessonId: { not: null } },
					],
				},
				userId: { in: [...userIds] },
			},
			select: {
				userId: true,
				score: true,
				quiz: {
					select: {
						courseId: true,
						documentId: true,
						lessonId: true,
						lesson: { select: { documentId: true } },
						module: { select: { courseId: true } },
					},
				},
			},
		});

		const best = new Map<string, QuizScoreRow & { courseId: number }>();
		for (const row of rows) {
			const { quiz } = row;
			// Por curso, el de módulo cuenta si el módulo es del mismo curso: es lo
			// que `activeModuleQuizOf` compara con un solo id.
			if (quiz.lessonId === null && quiz.module?.courseId !== quiz.courseId) {
				continue;
			}
			const itemDocumentId = quiz.lesson?.documentId ?? quiz.documentId;
			const key = `${quiz.courseId}:${itemDocumentId}:${row.userId}`;
			const current = best.get(key);
			if (!current || row.score > current.score) {
				best.set(key, {
					courseId: quiz.courseId,
					userId: row.userId,
					itemDocumentId,
					score: row.score,
				});
			}
		}

		for (const { courseId, ...score } of best.values()) {
			byCourse.get(courseId)?.push(score);
		}
		return byCourse;
	},

	async findFinalBestScores(courseId, userIds) {
		const rows = await prisma.quizAttempt.groupBy({
			by: ["userId"],
			where: {
				quiz: { courseId, ...FINAL_QUIZ, ...ACTIVE },
				...(userIds ? { userId: { in: [...userIds] } } : {}),
			},
			_max: { score: true },
		});
		return rows.flatMap((row) =>
			row._max.score === null
				? []
				: [{ userId: row.userId, score: row._max.score }],
		);
	},

	async findFollowUps(courseId) {
		const rows = await prisma.quiz.findMany({
			where: { courseId, sessionId: { not: null } },
			orderBy: [{ session: { startsAt: "asc" } }, { createdAt: "asc" }],
			select: FOLLOW_UP_SELECT,
		});
		return toStoredFollowUps(rows);
	},

	async findFollowUpBanks(courseId) {
		const rows = await prisma.quiz.findMany({
			where: { courseId, sessionId: { not: null } },
			select: { ...QUIZ_SELECT, _count: { select: { attempts: true } } },
		});
		return rows.map(({ _count, ...quiz }) => ({
			...quiz,
			attemptCount: _count.attempts,
		}));
	},

	async findFollowUp(courseId, documentId) {
		const row = await prisma.quiz.findFirst({
			where: { courseId, documentId, sessionId: { not: null } },
			select: FOLLOW_UP_SELECT,
		});
		return row ? (toStoredFollowUps([row])[0] ?? null) : null;
	},

	async findSessionId(courseId, sessionDocumentId) {
		const session = await prisma.courseSession.findFirst({
			where: { courseId, documentId: sessionDocumentId },
			select: { id: true },
		});
		return session?.id ?? null;
	},

	async createFollowUp(courseId, write) {
		return prisma.quiz.create({
			data: { courseId, ...write },
			select: { id: true, documentId: true },
		});
	},

	async updateFollowUp(id, write) {
		await prisma.quiz.update({ where: { id }, data: write });
	},

	async deleteFollowUp(id) {
		await prisma.quiz.delete({ where: { id } });
	},

	async openFollowUp(id, at) {
		await prisma.quiz.update({ where: { id }, data: { openedAt: at } });
	},

	async closeFollowUp(id, at) {
		await prisma.quiz.update({ where: { id }, data: { closedAt: at } });
	},

	async findFollowUpBestScores(courseId, userIds) {
		const rows = await prisma.quizAttempt.findMany({
			where: {
				quiz: { courseId, sessionId: { not: null } },
				...(userIds ? { userId: { in: [...userIds] } } : {}),
			},
			select: {
				score: true,
				quiz: { select: { id: true, documentId: true } },
				user: { select: { id: true, documentId: true } },
			},
		});

		const best = new Map<string, FollowUpScoreRow>();
		for (const row of rows) {
			const key = `${row.quiz.id}:${row.user.id}`;
			const current = best.get(key);
			if (!current || row.score > current.score) {
				best.set(key, {
					quizId: row.quiz.id,
					quizDocumentId: row.quiz.documentId,
					userId: row.user.id,
					userDocumentId: row.user.documentId,
					score: row.score,
				});
			}
		}
		return [...best.values()];
	},

	async findTeachingCourse(courseDocumentId, where) {
		return prisma.course.findFirst({
			where: { AND: [{ documentId: courseDocumentId }, asCourseWhere(where)] },
			select: {
				id: true,
				status: true,
				format: true,
				dependencyId: true,
				completionRule: true,
				requiresEvaluation: true,
				minPassingGrade: true,
			},
		});
	},

	async findBoardQuizzes(courseId) {
		const quizzes = await prisma.quiz.findMany({
			where: presentableQuizOf(courseId),
			select: {
				documentId: true,
				title: true,
				maxAttempts: true,
				lesson: {
					select: {
						documentId: true,
						title: true,
						order: true,
						module: { select: { order: true } },
					},
				},
				module: { select: { documentId: true, title: true, order: true } },
				session: { select: { startsAt: true } },
			},
		});

		// El temario manda: cada módulo con sus prácticas y luego su evaluación;
		// después el seguimiento, por sesión; el examen, al final.
		const positionOf = (
			quiz: (typeof quizzes)[number],
		): [number, number, number] => {
			if (quiz.lesson) return [quiz.lesson.module.order, 0, quiz.lesson.order];
			if (quiz.module) return [quiz.module.order, 1, 0];
			if (quiz.session) {
				return [
					Number.MAX_SAFE_INTEGER - 1,
					0,
					quiz.session.startsAt.getTime(),
				];
			}
			return [Number.MAX_SAFE_INTEGER, 0, 0];
		};

		return [...quizzes]
			.sort((a, b) => {
				const [left, right] = [positionOf(a), positionOf(b)];
				return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
			})
			.map((quiz): QuizBoardEntry => {
				const owner = {
					lessonDocumentId: quiz.lesson?.documentId ?? null,
					moduleDocumentId: quiz.module?.documentId ?? null,
					followUpDocumentId: quiz.session ? quiz.documentId : null,
				};
				return {
					quizDocumentId: quiz.documentId,
					owner,
					kind: quizKindOf(owner),
					ownerTitle: quiz.lesson?.title ?? quiz.module?.title ?? null,
					title: quiz.title,
					maxAttempts: quiz.maxAttempts,
				};
			});
	},

	async findLatestAttempts(courseId, userId) {
		const rows = await prisma.quizAttempt.findMany({
			where: {
				quiz: presentableQuizOf(courseId),
				...(userId === undefined ? {} : { userId }),
			},
			orderBy: { number: "desc" },
			select: {
				number: true,
				score: true,
				passed: true,
				retakeGrantedAt: true,
				quiz: { select: { documentId: true, maxAttempts: true } },
				user: { select: { documentId: true } },
			},
		});

		// Del más reciente al más antiguo: el primero de cada par es el vigente.
		const latest = new Map<string, QuizAttemptRow>();
		for (const row of rows) {
			const key = `${row.quiz.documentId}:${row.user.documentId}`;
			if (latest.has(key)) continue;
			latest.set(key, {
				quizDocumentId: row.quiz.documentId,
				userDocumentId: row.user.documentId,
				number: row.number,
				score: row.score,
				passed: row.passed,
				retakeGrantedAt: row.retakeGrantedAt,
				maxAttempts: row.quiz.maxAttempts,
			});
		}

		return [...latest.values()];
	},

	async findEnrolledParticipant(courseId, userDocumentId) {
		return prisma.enrollment.findFirst({
			where: {
				courseId,
				status: "ENROLLED",
				user: { documentId: userDocumentId },
			},
			select: { userId: true, result: true, completed: true },
		});
	},
});
