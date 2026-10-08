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
		optionCreate: [],
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
				createManyAndReturn: async (args: { data: { order: number }[] }) => {
					calls.questionCreate.push(args);
					return args.data.map((row) => ({
						id: 100 + row.order,
						order: row.order,
					}));
				},
			},
			quizOption: {
				createMany: async (args: unknown) => {
					calls.optionCreate.push(args);
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

		await repository.replaceBank(7, FINAL, bank, null);

		expect(calls.quizFind).toEqual([]);
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
				data: [
					{
						quizId: 5,
						statement: "¿Cuál?",
						type: "SINGLE_CHOICE",
						points: 2,
						order: 1,
					},
				],
				select: { id: true, order: true },
			},
		]);
		expect(calls.optionCreate).toEqual([
			{
				data: [
					{ questionId: 101, text: "A", isCorrect: true, order: 1 },
					{ questionId: 101, text: "B", isCorrect: false, order: 2 },
				],
			},
		]);
	});

	test("cuelga cada opción de su pregunta, en dos sentencias para todo el banco", async () => {
		const { repository, calls } = createHarness();

		await repository.replaceBank(
			7,
			FINAL,
			{
				...bank,
				questions: [
					...bank.questions,
					{
						statement: "¿Verdadero?",
						type: "TRUE_FALSE" as const,
						points: 1,
						options: [
							{ text: "Sí", isCorrect: false },
							{ text: "No", isCorrect: true },
						],
					},
				],
			},
			null,
		);

		expect(calls.questionCreate).toHaveLength(1);
		expect(calls.optionCreate).toEqual([
			{
				data: [
					{ questionId: 101, text: "A", isCorrect: true, order: 1 },
					{ questionId: 101, text: "B", isCorrect: false, order: 2 },
					{ questionId: 102, text: "Sí", isCorrect: false, order: 1 },
					{ questionId: 102, text: "No", isCorrect: true, order: 2 },
				],
			},
		]);
	});

	test("con el id que ya leyó el servicio, lo actualiza sin volver a buscarlo", async () => {
		const { repository, calls } = createHarness({ existing: { id: 3 } });

		await repository.replaceBank(7, FINAL, bank, 3);

		expect(calls.quizFind).toEqual([]);
		expect(calls.quizCreate).toEqual([]);
		expect(calls.quizUpdate).toEqual([
			{
				where: { id: 3 },
				data: {
					title: "Examen",
					passingScore: 70,
					maxAttempts: 3,
					shuffleQuestions: false,
				},
			},
		]);
		expect(calls.questionDelete).toEqual([{ where: { quizId: 3 } }]);
	});

	test("un banco sin preguntas solo borra las anteriores", async () => {
		const { repository, calls } = createHarness({ existing: { id: 3 } });

		await repository.replaceBank(7, FINAL, { ...bank, questions: [] }, 3);

		expect(calls.questionDelete).toEqual([{ where: { quizId: 3 } }]);
		expect(calls.questionCreate).toEqual([]);
		expect(calls.optionCreate).toEqual([]);
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

		await repository.replaceBank(
			7,
			{ lessonId: null, moduleId: 21 },
			bank,
			null,
		);

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

describe("quizRepository.findFollowUpBanks", () => {
	test("lee los bancos de todas las evaluaciones de seguimiento en una consulta", async () => {
		const queries: unknown[] = [];
		const repository = createQuizRepository({
			prisma: {
				quiz: {
					findMany: async (args: unknown) => {
						queries.push(args);
						return [
							{
								id: 40,
								documentId: "44444444-4444-4444-8444-444444444444",
								title: "Práctica de campo",
								passingScore: 60,
								maxAttempts: 1,
								shuffleQuestions: false,
								questions: [],
								_count: { attempts: 3 },
							},
						];
					},
				},
			} as unknown as ICradle["prisma"],
		});

		const banks = await repository.findFollowUpBanks(7);

		expect(queries).toHaveLength(1);
		expect(queries[0]).toMatchObject({
			where: { courseId: 7, sessionId: { not: null } },
		});
		expect(banks).toEqual([
			expect.objectContaining({ id: 40, attemptCount: 3, questions: [] }),
		]);
		expect(banks[0]).not.toHaveProperty("_count");
	});
});

describe("quizRepository.findLatestFollowUpAttempts", () => {
	const attemptRow = (quizId: number, number: number) => ({
		quizId,
		id: quizId * 10 + number,
		number,
		submittedAt: AT,
		score: 50,
		passed: false,
		retakeGrantedAt: null,
		answers: [],
	});

	test("lee los intentos del seguimiento del curso en una sola consulta", async () => {
		const { repository, calls } = createHarness();

		await repository.findLatestFollowUpAttempts(7, 50);

		expect(calls.attemptFindMany).toEqual([
			expect.objectContaining({
				where: { userId: 50, quiz: { courseId: 7, sessionId: { not: null } } },
				orderBy: { number: "desc" },
			}),
		]);
	});

	test("deja el intento de número más alto de cada cuestionario, sin el quizId", async () => {
		const { repository } = createHarness({
			attempts: [attemptRow(40, 2), attemptRow(41, 1), attemptRow(40, 1)],
		});

		const latest = await repository.findLatestFollowUpAttempts(7, 50);

		expect([...latest.keys()]).toEqual([40, 41]);
		expect(latest.get(40)).toEqual({
			id: 402,
			number: 2,
			submittedAt: AT,
			score: 50,
			passed: false,
			retakeGrantedAt: null,
			answers: [],
		});
		expect(latest.get(41)?.number).toBe(1);
	});
});

describe("quizRepository.findBestScoresIn", () => {
	const row = (
		score: number,
		quiz: {
			courseId: number;
			documentId: string;
			lessonId: number | null;
			lesson?: { documentId: string } | null;
			module?: { courseId: number } | null;
		},
	) => ({
		userId: 50,
		score,
		quiz: { lesson: null, module: null, ...quiz },
	});

	test("filtra por los cursos y conserva las dos ramas de findBestScores", async () => {
		const { repository, calls } = createHarness();

		await repository.findBestScoresIn([7, 8], [50]);

		expect(calls.attemptFindMany).toEqual([
			expect.objectContaining({
				where: {
					quiz: {
						courseId: { in: [7, 8] },
						OR: [
							{
								archivedAt: null,
								module: { courseId: { in: [7, 8] }, archivedAt: null },
							},
							{ lessonId: { not: null } },
						],
					},
					userId: { in: [50] },
				},
			}),
		]);
	});

	test("la mejor nota por curso y elemento; el módulo de otro curso no cuenta", async () => {
		const { repository } = createHarness({
			attempts: [
				row(40, {
					courseId: 7,
					documentId: "quiz-a",
					lessonId: 31,
					lesson: { documentId: "lesson-a" },
				}),
				row(90, {
					courseId: 7,
					documentId: "quiz-a",
					lessonId: 31,
					lesson: { documentId: "lesson-a" },
				}),
				row(70, {
					courseId: 8,
					documentId: "module-quiz",
					lessonId: null,
					module: { courseId: 8 },
				}),
				row(100, {
					courseId: 7,
					documentId: "stray-quiz",
					lessonId: null,
					module: { courseId: 8 },
				}),
			],
		});

		const byCourse = await repository.findBestScoresIn([7, 8], [50]);

		expect(byCourse).toEqual(
			new Map([
				[7, [{ userId: 50, itemDocumentId: "lesson-a", score: 90 }]],
				[8, [{ userId: 50, itemDocumentId: "module-quiz", score: 70 }]],
			]),
		);
	});
});

describe("quizRepository.findQuizWithAttemptCount", () => {
	test("el mismo cuestionario que findQuiz, con sus intentos contados", async () => {
		const calls: unknown[] = [];
		const repository = createQuizRepository({
			prisma: {
				quiz: {
					findFirst: async (args: { select: Record<string, unknown> }) => {
						calls.push(args);
						return args.select._count
							? { id: 9, title: "Examen", _count: { attempts: 4 } }
							: { id: 9, title: "Examen" };
					},
				},
			} as unknown as ICradle["prisma"],
		});

		const withCount = await repository.findQuizWithAttemptCount(7, FINAL);
		await repository.findQuiz(7, FINAL);

		expect(withCount).toEqual({ id: 9, title: "Examen", attemptCount: 4 });
		const [counted, plain] = calls as {
			where: unknown;
			select: Record<string, unknown>;
		}[];
		expect(counted.where).toEqual(plain.where);
		expect(counted.select).toEqual({
			...plain.select,
			_count: { select: { attempts: true } },
		});
	});
});
