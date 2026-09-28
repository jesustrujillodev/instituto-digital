import { Prisma } from "@prisma/client";
import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type { ICradle } from "@/shared/di/container.types";
import { ContentQuizAlreadyTakenError } from "../domain/content.errors";
import type { IQuizRepository } from "../domain/quiz.repository";
import { quizKindOf } from "../domain/quiz.rules";
import type {
	QuizAttemptRow,
	QuizBoardEntry,
	QuizOwnerIds,
	StoredQuiz,
} from "../domain/quiz.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const ACTIVE = { archivedAt: null } as const;

const asCourseWhere = (where: TeachingCourseWhere) =>
	where as unknown as Prisma.CourseWhereInput;

/** El cuestionario activo de ese dueño: los dos nulos son el examen final. */
const ownerWhere = (courseId: number, owner: QuizOwnerIds) => ({
	courseId,
	lessonId: owner.lessonId,
	moduleId: owner.moduleId,
	...ACTIVE,
});

/** Un cuestionario de módulo cuenta mientras él y su módulo sigan activos. */
const activeModuleQuizOf = (courseId: number) => ({
	courseId,
	...ACTIVE,
	module: { courseId, ...ACTIVE },
});

/** Lo que se presenta: prácticas y módulos activos, y el examen final. */
const presentableQuizOf = (courseId: number) => ({
	courseId,
	...ACTIVE,
	questions: { some: {} },
	OR: [
		{ lesson: { ...ACTIVE, module: { courseId, ...ACTIVE } } },
		{ module: { courseId, ...ACTIVE } },
		{ lessonId: null, moduleId: null },
	],
});

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

	async countAttempts(quizId) {
		return prisma.quizAttempt.count({ where: { quizId } });
	},

	async replaceBank(courseId, owner, bank) {
		const scalars = {
			title: bank.title,
			passingScore: bank.passingScore,
			maxAttempts: bank.maxAttempts,
			shuffleQuestions: bank.shuffleQuestions,
		};
		const existing = await prisma.quiz.findFirst({
			where: ownerWhere(courseId, owner),
			select: { id: true },
		});

		const quizId = existing
			? (
					await prisma.quiz.update({
						where: { id: existing.id },
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

		for (const [index, question] of bank.questions.entries()) {
			await prisma.quizQuestion.create({
				data: {
					quizId,
					statement: question.statement,
					type: question.type,
					points: question.points,
					order: index + 1,
					options: {
						create: question.options.map((option, position) => ({
							text: option.text,
							isCorrect: option.isCorrect,
							order: position + 1,
						})),
					},
				},
			});
		}
	},

	async rename(quizId, title) {
		await prisma.quiz.update({ where: { id: quizId }, data: { title } });
	},

	async archive(quizId, at) {
		await prisma.quiz.update({
			where: { id: quizId },
			data: { archivedAt: at },
		});
	},

	async findAttempt(quizId, userId) {
		return prisma.quizAttempt.findFirst({
			where: { quizId, userId },
			orderBy: { number: "desc" },
			select: {
				id: true,
				number: true,
				submittedAt: true,
				score: true,
				passed: true,
				retakeGrantedAt: true,
				answers: {
					select: { questionId: true, optionId: true, isCorrect: true },
				},
			},
		});
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

	async findTeachingCourse(courseDocumentId, where) {
		return prisma.course.findFirst({
			where: { AND: [{ documentId: courseDocumentId }, asCourseWhere(where)] },
			select: { id: true, status: true, format: true, dependencyId: true },
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
			},
		});

		// El temario manda: cada módulo con sus prácticas y luego su evaluación;
		// el examen, al final.
		const positionOf = (
			quiz: (typeof quizzes)[number],
		): [number, number, number] => {
			if (quiz.lesson) return [quiz.lesson.module.order, 0, quiz.lesson.order];
			if (quiz.module) return [quiz.module.order, 1, 0];
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
