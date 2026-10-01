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
		bestScore?: number | null;
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
		attemptAggregate: [],
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
				aggregate: async (args: unknown) => {
					calls.attemptAggregate.push(args);
					return { _max: { score: options.bestScore ?? null } };
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

const bank = {
	title: "Examen",
	passingScore: 70,
	maxAttempts: 3,
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
					sessionId: null,
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
					maxAttempts: 3,
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
			quiz: { documentId: quiz, maxAttempts: 2 },
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

		const latest = await repository.findLatestAttempts(7);

		expect(
			latest.map((attempt) => [
				attempt.userDocumentId,
				attempt.number,
				attempt.maxAttempts,
			]),
		).toEqual([
			["ana", 2, 2],
			["luis", 1, 2],
		]);
		expect(calls.attemptFindMany).toEqual([
			expect.objectContaining({
				where: {
					quiz: expect.objectContaining({
						courseId: 7,
						archivedAt: null,
						questions: { some: {} },
					}),
				},
				orderBy: { number: "desc" },
			}),
		]);
	});
});

describe("mejores notas (docs/adr/0024)", () => {
	test("de varios intentos queda el mejor, aprobado o no", async () => {
		const row = (userId: number, score: number, lesson: string | null) => ({
			userId,
			score,
			quiz: {
				documentId: "q-module",
				lesson: lesson ? { documentId: lesson } : null,
			},
		});
		const { repository } = createHarness({
			attempts: [
				row(1, 40, null),
				row(1, 65, null),
				row(1, 50, null),
				row(2, 30, "l-practice"),
			],
		});

		expect(await repository.findBestScores(7)).toEqual([
			{ userId: 1, itemDocumentId: "q-module", score: 65 },
			{ userId: 2, itemDocumentId: "l-practice", score: 30 },
		]);
	});

	test("la mejor de una persona en un cuestionario sale del máximo", async () => {
		const { repository, calls } = createHarness({ bestScore: 82 });

		expect(await repository.findBestScore(9, 50)).toBe(82);
		expect(calls.attemptAggregate).toEqual([
			{ where: { quizId: 9, userId: 50 }, _max: { score: true } },
		]);
	});

	test("sin intentos no hay mejor nota", async () => {
		const { repository } = createHarness();

		expect(await repository.findBestScore(9, 50)).toBeNull();
	});
});
