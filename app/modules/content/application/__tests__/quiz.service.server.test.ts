import { describe, expect, test } from "vitest";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { ResultWrite } from "@/modules/enrollments/domain/enrollment.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	actorOf,
	COURSE_DOC,
	LESSON_1,
} from "../../domain/__tests__/content.fixtures";
import type { ClassroomCourse } from "../../domain/classroom.types";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import type {
	GradedAttempt,
	QuizBankWrite,
	StoredAttempt,
	StoredQuiz,
} from "../../domain/quiz.types";
import { createQuizService } from "../quiz.service.server";

const NOW = new Date("2027-03-10T18:00:00.000Z");
const ANA = actorOf({ userId: 50, role: "USER" });
const HEAD = actorOf();
const Q1 = "11111111-1111-4111-8111-111111111111";
const RIGHT = "01000000-0000-4000-8000-000000000000";
const WRONG = "02000000-0000-4000-8000-000000000000";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const quizOf = (): StoredQuiz => ({
	id: 9,
	documentId: "99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	title: "Examen final",
	passingScore: 70,
	shuffleQuestions: false,
	questions: [
		{
			id: 10,
			documentId: Q1,
			statement: "¿Cuál?",
			type: "SINGLE_CHOICE",
			points: 1,
			options: [
				{ id: 1, documentId: RIGHT, text: "Esta", isCorrect: true },
				{ id: 2, documentId: WRONG, text: "Aquella", isCorrect: false },
			],
		},
	],
});

const classroomCourseOf = (
	overrides: Partial<ClassroomCourse> = {},
): ClassroomCourse => ({
	id: 7,
	documentId: COURSE_DOC,
	title: "Transparencia",
	status: "PUBLISHED",
	format: "SELF_PACED",
	completionRule: "CONTENT",
	requiresEvaluation: true,
	evaluationMethod: "QUIZ",
	enrollment: {
		status: "ENROLLED",
		progressPercent: 100,
		contentCompletedAt: new Date("2027-03-01T00:00:00Z"),
		completed: false,
	},
	...overrides,
});

const createHarness = (
	options: {
		course?: ClassroomCourse | null;
		editable?: { status: CourseStatus } | null;
		quiz?: StoredQuiz | null;
		attempt?: StoredAttempt | null;
		attemptCount?: number;
		lessonType?: string;
	} = {},
) => {
	let inTransaction = false;
	const calls = {
		replaced: [] as { lessonId: number | null; bank: QuizBankWrite }[],
		renamed: [] as string[],
		attempts: [] as GradedAttempt[],
		results: [] as ResultWrite[][],
		progress: [] as string[],
		recalculated: 0,
		synced: 0,
		lockedInTransaction: [] as boolean[],
	};
	const quiz = options.quiz === undefined ? quizOf() : options.quiz;

	const contentRepository = {
		findCourse: async () =>
			options.editable === null
				? null
				: {
						id: 7,
						status: options.editable?.status ?? "DRAFT",
						format: "SELF_PACED",
					},
		findLesson: async (_courseId: number, documentId: string) =>
			documentId === LESSON_1
				? {
						id: 31,
						moduleId: 21,
						type: options.lessonType ?? "QUIZ",
						isRequired: true,
					}
				: null,
	} as unknown as ICradle["contentRepository"];

	const classroomRepository = {
		findCourse: async () =>
			options.course === undefined ? classroomCourseOf() : options.course,
		findProgress: async () => [],
		saveProgress: async (
			_lessonId: number,
			_userId: number,
			status: string,
		) => {
			calls.progress.push(status);
		},
	} as unknown as ICradle["classroomRepository"];

	const quizRepository = {
		findQuiz: async () => quiz,
		countAttempts: async () => options.attemptCount ?? 0,
		replaceBank: async (
			_courseId: number,
			lessonId: number | null,
			bank: QuizBankWrite,
		) => {
			calls.replaced.push({ lessonId, bank });
		},
		rename: async (_quizId: number, title: string) => {
			calls.renamed.push(title);
		},
		findAttempt: async () => options.attempt ?? null,
		saveAttempt: async (
			_quizId: number,
			_userId: number,
			attempt: GradedAttempt,
		) => {
			calls.attempts.push(attempt);
		},
	} as unknown as ICradle["quizRepository"];

	const enrollmentRepository = {
		lockCourseSeats: async () => {
			calls.lockedInTransaction.push(inTransaction);
			return { capacity: null, enrolled: 0 };
		},
		saveResults: async (_courseId: number, entries: ResultWrite[]) => {
			calls.results.push(entries);
		},
	} as unknown as ICradle["enrollmentRepository"];

	const runInTransaction = (async <T>(work: () => Promise<T>) => {
		inTransaction = true;
		try {
			return await work();
		} finally {
			inTransaction = false;
		}
	}) as unknown as ICradle["runInTransaction"];

	const service = createQuizService({
		contentRepository,
		classroomRepository,
		quizRepository,
		enrollmentRepository,
		progressSync: {
			recalculate: async () => {
				calls.recalculated += 1;
				return [];
			},
		} as unknown as ICradle["progressSync"],
		completionSync: {
			sync: async () => {
				calls.synced += 1;
				return { completed: 1, diff: { grant: [], restore: [], revoke: [] } };
			},
		} as unknown as ICradle["completionSync"],
		runInTransaction,
		clock: { now: () => NOW },
		logger: silentLogger,
	});

	return { service, calls };
};

const bankDto = {
	lessonDocumentId: null,
	title: "Examen final",
	passingScore: 70,
	shuffleQuestions: false,
	questions: [
		{
			statement: "¿Cuál?",
			type: "SINGLE_CHOICE" as const,
			points: 1,
			options: [
				{ text: "Esta", isCorrect: true },
				{ text: "Aquella", isCorrect: false },
			],
		},
	],
};

describe("saveBank", () => {
	test("reescribe el banco dentro de una transacción con el curso bloqueado", async () => {
		const { service, calls } = createHarness();

		const result = await service.saveBank(COURSE_DOC, bankDto, HEAD);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.lockedInTransaction).toEqual([true]);
		expect(calls.replaced).toEqual([
			{
				lessonId: null,
				bank: {
					title: "Examen final",
					passingScore: 70,
					shuffleQuestions: false,
					questions: bankDto.questions,
				},
			},
		]);
	});

	test("con intentos enviados el banco no cambia", async () => {
		const { service, calls } = createHarness({ attemptCount: 1 });

		const result = await service.saveBank(COURSE_DOC, bankDto, HEAD);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_LOCKED },
		});
		expect(calls.replaced).toEqual([]);
	});

	test("el título sí se corrige con intentos", async () => {
		const { service, calls } = createHarness({ attemptCount: 3 });

		const result = await service.renameQuiz(
			COURSE_DOC,
			{ lessonDocumentId: null, title: "Examen de salida" },
			HEAD,
		);

		expect(result.success).toBe(true);
		expect(calls.renamed).toEqual(["Examen de salida"]);
	});

	test("una lección que no es de cuestionario no lleva banco", async () => {
		const { service } = createHarness({ lessonType: "TEXT" });

		const result = await service.saveBank(
			COURSE_DOC,
			{ ...bankDto, lessonDocumentId: LESSON_1 },
			HEAD,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.MATERIAL_MISMATCH },
		});
	});

	test("un curso finalizado ya no cambia su cuestionario", async () => {
		const { service } = createHarness({ editable: { status: "FINISHED" } });

		expect(await service.saveBank(COURSE_DOC, bankDto, HEAD)).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.COURSE_NOT_EDITABLE },
		});
	});
});

describe("submit: examen final", () => {
	const submitDto = (optionDocumentId: string) => ({
		lessonDocumentId: null,
		answers: [{ questionDocumentId: Q1, optionDocumentId }],
	});

	// El resultado entra por la misma vía que la captura manual.
	test("escribe resultado y nota, y un autogestivo acredita al momento", async () => {
		const { service, calls } = createHarness();

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result).toMatchObject({
			success: true,
			data: { score: 100, passed: true, questions: [{ correct: true }] },
		});
		expect(calls.results).toEqual([
			[{ userId: 50, result: "PASSED", grade: 100 }],
		]);
		expect(calls.synced).toBe(1);
		expect(calls.lockedInTransaction).toEqual([true]);
	});

	test("reprobar también escribe el resultado", async () => {
		const { service, calls } = createHarness();

		await service.submit(COURSE_DOC, submitDto(WRONG), ANA);

		expect(calls.results).toEqual([
			[{ userId: 50, result: "FAILED", grade: 0 }],
		]);
	});

	// Uno con sesiones calcula el completado al cierre.
	test("un curso con sesiones publicado guarda la nota sin recalcular", async () => {
		const { service, calls } = createHarness({
			course: classroomCourseOf({
				format: "SCHEDULED",
				completionRule: "ATTENDANCE",
			}),
		});

		await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(calls.results).toHaveLength(1);
		expect(calls.synced).toBe(0);
	});

	test("un segundo intento se rechaza y no escribe", async () => {
		const { service, calls } = createHarness({
			attempt: { submittedAt: NOW, score: 0, passed: false, answers: [] },
		});

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN },
		});
		expect(calls.attempts).toEqual([]);
		expect(calls.results).toEqual([]);
	});

	test("con el contenido sin terminar todavía no se presenta", async () => {
		const { service, calls } = createHarness({
			course: classroomCourseOf({
				enrollment: {
					status: "ENROLLED",
					progressPercent: 50,
					contentCompletedAt: null,
					completed: false,
				},
			}),
		});

		expect(
			await service.submit(COURSE_DOC, submitDto(RIGHT), ANA),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_NOT_AVAILABLE },
		});
		expect(calls.attempts).toEqual([]);
	});

	test("sin inscripción activa falla con error tipado", async () => {
		const { service } = createHarness({
			course: classroomCourseOf({ enrollment: null }),
		});

		expect(
			await service.submit(COURSE_DOC, submitDto(RIGHT), ANA),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.NOT_ENROLLED },
		});
	});

	test("en un curso de captura manual el examen no se presenta", async () => {
		const { service } = createHarness({
			course: classroomCourseOf({ evaluationMethod: "MANUAL" }),
		});

		expect(
			await service.submit(COURSE_DOC, submitDto(RIGHT), ANA),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_NOT_EVALUATED },
		});
	});
});

describe("submit: práctica", () => {
	test("enviarla completa la lección aunque repruebe, sin tocar el resultado", async () => {
		const { service, calls } = createHarness();

		const result = await service.submit(
			COURSE_DOC,
			{
				lessonDocumentId: LESSON_1,
				answers: [{ questionDocumentId: Q1, optionDocumentId: WRONG }],
			},
			ANA,
		);

		expect(result).toMatchObject({ success: true, data: { passed: false } });
		expect(calls.progress).toEqual(["COMPLETED"]);
		expect(calls.recalculated).toBe(1);
		expect(calls.results).toEqual([]);
	});
});

describe("findView", () => {
	test("la hoja no contiene la respuesta correcta", async () => {
		const { service } = createHarness();

		const result = await service.findView(COURSE_DOC, null, ANA);

		expect(result).toMatchObject({
			success: true,
			data: { availability: "AVAILABLE", outcome: null },
		});
		expect(JSON.stringify(result)).not.toContain("isCorrect");
	});

	test("ya presentado, devuelve el resultado y ninguna hoja", async () => {
		const { service } = createHarness({
			attempt: {
				submittedAt: NOW,
				score: 0,
				passed: false,
				answers: [{ questionId: 10, optionId: 2, isCorrect: false }],
			},
		});

		const result = await service.findView(COURSE_DOC, null, ANA);

		expect(result).toMatchObject({
			success: true,
			data: {
				availability: "TAKEN",
				sheet: null,
				outcome: { score: 0, questions: [{ correct: false }] },
			},
		});
		expect(JSON.stringify(result)).not.toContain("isCorrect");
	});

	test("un curso de captura manual no enseña examen", async () => {
		const { service } = createHarness({
			course: classroomCourseOf({ evaluationMethod: "MANUAL" }),
		});

		expect(await service.findView(COURSE_DOC, null, ANA)).toMatchObject({
			success: true,
			data: null,
		});
	});
});
