import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import { createQuizRepository } from "../quiz.repository.server";

const AT = new Date("2027-03-10T18:00:00.000Z");

const createHarness = (
	options: { existing?: { id: number } | null; createError?: Error } = {},
) => {
	const calls: Record<string, unknown[]> = {
		quizCreate: [],
		quizUpdate: [],
		questionDelete: [],
		questionCreate: [],
		attemptCreate: [],
	};

	const repository = createQuizRepository({
		prisma: {
			quiz: {
				findFirst: async () => options.existing ?? null,
				create: async (args: unknown) => {
					calls.quizCreate.push(args);
					return { id: 5 };
				},
				update: async (args: unknown) => {
					calls.quizUpdate.push(args);
					return { id: options.existing?.id ?? 5 };
				},
			},
			quizQuestion: {
				deleteMany: async (args: unknown) => {
					calls.questionDelete.push(args);
				},
				create: async (args: unknown) => {
					calls.questionCreate.push(args);
				},
			},
			quizAttempt: {
				create: async (args: unknown) => {
					if (options.createError) throw options.createError;
					calls.attemptCreate.push(args);
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

const bank = {
	title: "Examen",
	passingScore: 70,
	shuffleQuestions: false,
	questions: [
		{
			statement: "¿Cuál?",
			type: "SINGLE_CHOICE" as const,
			points: 2,
			options: [
				{ text: "A", isCorrect: true },
				{ text: "B", isCorrect: false },
			],
		},
	],
};

describe("quizRepository.replaceBank", () => {
	test("crea el examen si no existe y escribe preguntas y opciones en orden", async () => {
		const { repository, calls } = createHarness();

		await repository.replaceBank(7, null, bank);

		expect(calls.quizCreate).toEqual([
			{
				data: {
					courseId: 7,
					lessonId: null,
					title: "Examen",
					passingScore: 70,
					shuffleQuestions: false,
				},
			},
		]);
		expect(calls.questionDelete).toEqual([{ where: { quizId: 5 } }]);
		expect(calls.questionCreate).toEqual([
			{
				data: {
					quizId: 5,
					statement: "¿Cuál?",
					type: "SINGLE_CHOICE",
					points: 2,
					order: 1,
					options: {
						create: [
							{ text: "A", isCorrect: true, order: 1 },
							{ text: "B", isCorrect: false, order: 2 },
						],
					},
				},
			},
		]);
	});

	test("si ya existe, lo actualiza en lugar de crear otro", async () => {
		const { repository, calls } = createHarness({ existing: { id: 3 } });

		await repository.replaceBank(7, null, bank);

		expect(calls.quizCreate).toEqual([]);
		expect(calls.quizUpdate).toHaveLength(1);
		expect(calls.questionDelete).toEqual([{ where: { quizId: 3 } }]);
	});
});

describe("quizRepository.saveAttempt", () => {
	// Dos envíos simultáneos: la unicidad es la última defensa del intento único.
	test("el choque con la unicidad es el intento repetido", async () => {
		const { repository } = createHarness({
			createError: new Prisma.PrismaClientKnownRequestError("duplicado", {
				code: "P2002",
				clientVersion: "test",
			}),
		});

		await expect(
			repository.saveAttempt(
				9,
				50,
				{ score: 100, passed: true, answers: [] },
				AT,
			),
		).rejects.toMatchObject({ code: CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN });
	});
});
