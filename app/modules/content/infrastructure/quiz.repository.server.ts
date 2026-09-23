import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { ContentQuizAlreadyTakenError } from "../domain/content.errors";
import type { IQuizRepository } from "../domain/quiz.repository";
import type { StoredQuiz } from "../domain/quiz.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

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
	async findQuiz(courseId, lessonId): Promise<StoredQuiz | null> {
		return prisma.quiz.findFirst({
			where: { courseId, lessonId },
			select: QUIZ_SELECT,
		});
	},

	async countAttempts(quizId) {
		return prisma.quizAttempt.count({ where: { quizId } });
	},

	async replaceBank(courseId, lessonId, bank) {
		const scalars = {
			title: bank.title,
			passingScore: bank.passingScore,
			shuffleQuestions: bank.shuffleQuestions,
		};
		const existing = await prisma.quiz.findFirst({
			where: { courseId, lessonId },
			select: { id: true },
		});

		const quizId = existing
			? (
					await prisma.quiz.update({
						where: { id: existing.id },
						data: scalars,
					})
				).id
			: (await prisma.quiz.create({ data: { courseId, lessonId, ...scalars } }))
					.id;

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

	async findAttempt(quizId, userId) {
		return prisma.quizAttempt.findUnique({
			where: { quizId_userId: { quizId, userId } },
			select: {
				submittedAt: true,
				score: true,
				passed: true,
				answers: {
					select: { questionId: true, optionId: true, isCorrect: true },
				},
			},
		});
	},

	async saveAttempt(quizId, userId, attempt, at) {
		try {
			await prisma.quizAttempt.create({
				data: {
					quizId,
					userId,
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
});
