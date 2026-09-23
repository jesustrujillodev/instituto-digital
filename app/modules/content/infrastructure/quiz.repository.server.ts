import { Prisma } from "@prisma/client";
import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type { ICradle } from "@/shared/di/container.types";
import { ContentQuizAlreadyTakenError } from "../domain/content.errors";
import type { IQuizRepository } from "../domain/quiz.repository";
import type {
	ModuleQuizAttemptRow,
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

const QUIZ_SELECT = {
	id: true,
	documentId: true,
	title: true,
	passingScore: true,
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

	async findPassedModuleQuizzes(courseId, userIds) {
		const rows = await prisma.quizAttempt.findMany({
			where: {
				passed: true,
				quiz: activeModuleQuizOf(courseId),
				...(userIds ? { userId: { in: [...userIds] } } : {}),
			},
			distinct: ["quizId", "userId"],
			select: { userId: true, quiz: { select: { documentId: true } } },
		});

		return rows.map((row) => ({
			userId: row.userId,
			quizDocumentId: row.quiz.documentId,
		}));
	},

	async findTeachingCourse(courseDocumentId, where) {
		return prisma.course.findFirst({
			where: { AND: [{ documentId: courseDocumentId }, asCourseWhere(where)] },
			select: { id: true, status: true, format: true, dependencyId: true },
		});
	},

	async findModuleQuizzes(courseId) {
		const quizzes = await prisma.quiz.findMany({
			where: activeModuleQuizOf(courseId),
			orderBy: { module: { order: "asc" } },
			select: {
				documentId: true,
				title: true,
				module: { select: { documentId: true, title: true } },
			},
		});

		// El filtro ya exige módulo; el tipo de Prisma no lo sabe.
		return quizzes.flatMap((quiz) =>
			quiz.module
				? [
						{
							quizDocumentId: quiz.documentId,
							moduleDocumentId: quiz.module.documentId,
							moduleTitle: quiz.module.title,
							title: quiz.title,
						},
					]
				: [],
		);
	},

	async findLatestModuleAttempts(courseId, userId) {
		const rows = await prisma.quizAttempt.findMany({
			where: {
				quiz: activeModuleQuizOf(courseId),
				...(userId === undefined ? {} : { userId }),
			},
			orderBy: { number: "desc" },
			select: {
				number: true,
				score: true,
				passed: true,
				retakeGrantedAt: true,
				quiz: { select: { documentId: true } },
				user: { select: { documentId: true } },
			},
		});

		// Del más reciente al más antiguo: el primero de cada par es el vigente.
		const latest = new Map<string, ModuleQuizAttemptRow>();
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
			});
		}

		return [...latest.values()];
	},

	async findEnrolledUserId(courseId, userDocumentId) {
		const enrollment = await prisma.enrollment.findFirst({
			where: {
				courseId,
				status: "ENROLLED",
				user: { documentId: userDocumentId },
			},
			select: { userId: true },
		});

		return enrollment?.userId ?? null;
	},
});
