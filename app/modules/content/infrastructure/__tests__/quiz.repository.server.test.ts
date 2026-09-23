import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import { createQuizRepository } from "../quiz.repository.server";

const AT = new Date("2027-03-10T18:00:00.000Z");
const FINAL = { lessonId: null, moduleId: null };

const createHarness = (
	options: {
		existing?: { id: number } | null;
		createError?: Error;
		attempts?: unknown[];
	} = {},
) => {
	const calls: Record<string, unknown[]> = {
		quizFind: [],
		quizCreate: [],
		quizUpdate: [],
		questionDelete: [],
		questionCreate: [],
		attemptCreate: [],
		attemptFindMany: [],
	};

	const repository = createQuizRepository({
		prisma: {
			quiz: {
				findFirst: async (args: unknown) => {
					calls.quizFind.push(args);
					return options.existing ?? null;
				},
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
				findMany: async (args: unknown) => {
					calls.attemptFindMany.push(args);
					return options.attempts ?? [];
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

		await repository.replaceBank(7, FINAL, bank);

		expect(calls.quizFind).toEqual([
			{
				where: {
					courseId: 7,
					lessonId: null,
					moduleId: null,
					archivedAt: null,
				},
				select: { id: true },
			},
		]);
		expect(calls.quizCreate).toEqual([
			{
				data: {
					courseId: 7,
					lessonId: null,
					moduleId: null,
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

		await repository.replaceBank(7, FINAL, bank);

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
				2,
				{ score: 100, passed: true, answers: [] },
				AT,
			),
		).rejects.toMatchObject({ code: CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN });
	});

	test("guarda el número del intento", async () => {
		const { repository, calls } = createHarness();

		await repository.saveAttempt(
			9,
			50,
			2,
			{ score: 80, passed: true, answers: [] },
			AT,
		);

		expect(calls.attemptCreate).toEqual([
			{
				data: expect.objectContaining({ quizId: 9, userId: 50, number: 2 }),
			},
		]);
	});
});

describe("evaluaciones de módulo", () => {
	test("la de un módulo se crea colgando de él", async () => {
		const { repository, calls } = createHarness();

		await repository.replaceBank(7, { lessonId: null, moduleId: 21 }, bank);

		expect(calls.quizCreate).toEqual([
			{ data: expect.objectContaining({ lessonId: null, moduleId: 21 }) },
		]);
	});

	test("el último intento de cada quien es el de número más alto", async () => {
		const row = (
			quiz: string,
			user: string,
			number: number,
			passed: boolean,
		) => ({
			number,
			score: passed ? 90 : 40,
			passed,
			retakeGrantedAt: passed ? null : AT,
			quiz: { documentId: quiz },
			user: { documentId: user },
		});
		const { repository, calls } = createHarness({
			// Ya vienen del más reciente al más antiguo, como los pide la consulta.
			attempts: [
				row("q-1", "ana", 2, true),
				row("q-1", "luis", 1, false),
				row("q-1", "ana", 1, false),
			],
		});

		const latest = await repository.findLatestModuleAttempts(7);

		expect(
			latest.map((attempt) => [attempt.userDocumentId, attempt.number]),
		).toEqual([
			["ana", 2],
			["luis", 1],
		]);
		expect(calls.attemptFindMany).toEqual([
			expect.objectContaining({
				where: {
					quiz: {
						courseId: 7,
						archivedAt: null,
						module: { courseId: 7, archivedAt: null },
					},
				},
				orderBy: { number: "desc" },
			}),
		]);
	});
});
