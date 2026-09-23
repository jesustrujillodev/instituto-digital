import { describe, expect, test } from "vitest";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { ResultWrite } from "@/modules/enrollments/domain/enrollment.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import {
	actorOf,
	COURSE_DOC,
	LESSON_1,
	MODULE_A,
	OTHER_DOC,
} from "../../domain/__tests__/content.fixtures";
import type { ClassroomCourse } from "../../domain/classroom.types";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import { FINAL_QUIZ_OWNER } from "../../domain/quiz.rules";
import type {
	GradedAttempt,
	ModuleQuizAttemptRow,
	QuizBankWrite,
	QuizOwnerIds,
	QuizTeachingCourseRef,
	StoredAttempt,
	StoredQuiz,
} from "../../domain/quiz.types";
import { createQuizService } from "../quiz.service.server";

const NOW = new Date("2027-03-10T18:00:00.000Z");
const ANA = actorOf({ userId: 50, role: "USER" });
const HEAD = actorOf();
const TRAINER = actorOf({ userId: 70, role: "USER", isTrainer: true });
const NOBODY = actorOf({ userId: 80, role: "USER", isTrainer: false });
const MODULE_OWNER = { lessonDocumentId: null, moduleDocumentId: MODULE_A };
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

const attemptOf = (overrides: Partial<StoredAttempt> = {}): StoredAttempt => ({
	id: 5,
	number: 1,
	submittedAt: NOW,
	score: 0,
	passed: false,
	retakeGrantedAt: null,
	answers: [],
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
		/** El curso visto por quien imparte; `null` finge que no lo imparte. */
		teaching?: QuizTeachingCourseRef | null;
		enrolledUserId?: number | null;
		moduleAttempts?: ModuleQuizAttemptRow[];
	} = {},
) => {
	let inTransaction = false;
	const calls = {
		replaced: [] as { owner: QuizOwnerIds; bank: QuizBankWrite }[],
		renamed: [] as string[],
		archived: [] as number[],
		attempts: [] as { number: number; attempt: GradedAttempt }[],
		retakes: [] as { attemptId: number; actorId: number }[],
		results: [] as ResultWrite[][],
		progress: [] as string[],
		recalculated: [] as (readonly number[] | undefined)[],
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
		findModule: async (_courseId: number, documentId: string) =>
			documentId === MODULE_A
				? { id: 21, activeLessons: 2, hasActiveQuiz: true }
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
			owner: QuizOwnerIds,
			bank: QuizBankWrite,
		) => {
			calls.replaced.push({ owner, bank });
		},
		rename: async (_quizId: number, title: string) => {
			calls.renamed.push(title);
		},
		archive: async (quizId: number) => {
			calls.archived.push(quizId);
		},
		findAttempt: async () => options.attempt ?? null,
		saveAttempt: async (
			_quizId: number,
			_userId: number,
			number: number,
			attempt: GradedAttempt,
		) => {
			calls.attempts.push({ number, attempt });
		},
		grantRetake: async (attemptId: number, actorId: number) => {
			calls.retakes.push({ attemptId, actorId });
		},
		findTeachingCourse: async () =>
			options.teaching === undefined
				? { id: 7, status: "PUBLISHED", format: "SELF_PACED", dependencyId: 3 }
				: options.teaching,
		findEnrolledUserId: async (_courseId: number, documentId: string) =>
			documentId === ANA.documentId
				? options.enrolledUserId === undefined
					? 50
					: options.enrolledUserId
				: null,
		findModuleQuizzes: async () => [
			{
				quizDocumentId: quizOf().documentId,
				moduleDocumentId: MODULE_A,
				moduleTitle: "Fundamentos",
				title: "Evaluación",
			},
		],
		findLatestModuleAttempts: async () => options.moduleAttempts ?? [],
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
			recalculate: async (
				_course: unknown,
				_actorId: number,
				_at: Date,
				userIds?: readonly number[],
			) => {
				calls.recalculated.push(userIds);
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
	...FINAL_QUIZ_OWNER,
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
				owner: { lessonId: null, moduleId: null },
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
			{ ...FINAL_QUIZ_OWNER, title: "Examen de salida" },
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
		...FINAL_QUIZ_OWNER,
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
			attempt: attemptOf(),
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
				moduleDocumentId: null,
				answers: [{ questionDocumentId: Q1, optionDocumentId: WRONG }],
			},
			ANA,
		);

		expect(result).toMatchObject({ success: true, data: { passed: false } });
		expect(calls.progress).toEqual(["COMPLETED"]);
		expect(calls.recalculated).toEqual([[50]]);
		expect(calls.results).toEqual([]);
	});
});

describe("findView", () => {
	test("la hoja no contiene la respuesta correcta", async () => {
		const { service } = createHarness();

		const result = await service.findView(COURSE_DOC, FINAL_QUIZ_OWNER, ANA);

		expect(result).toMatchObject({
			success: true,
			data: { availability: "AVAILABLE", outcome: null },
		});
		expect(JSON.stringify(result)).not.toContain("isCorrect");
	});

	test("ya presentado, devuelve el resultado y ninguna hoja", async () => {
		const { service } = createHarness({
			attempt: attemptOf({
				answers: [{ questionId: 10, optionId: 2, isCorrect: false }],
			}),
		});

		const result = await service.findView(COURSE_DOC, FINAL_QUIZ_OWNER, ANA);

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

		expect(
			await service.findView(COURSE_DOC, FINAL_QUIZ_OWNER, ANA),
		).toMatchObject({
			success: true,
			data: null,
		});
	});
});

describe("evaluación de módulo (docs/adr/0016)", () => {
	const submitDto = (optionDocumentId: string) => ({
		...MODULE_OWNER,
		answers: [{ questionDocumentId: Q1, optionDocumentId }],
	});

	test("crearla en un curso publicado recalcula a todo inscrito", async () => {
		const { service, calls } = createHarness({
			quiz: null,
			editable: { status: "PUBLISHED" },
		});

		const result = await service.saveBank(
			COURSE_DOC,
			{ ...bankDto, ...MODULE_OWNER },
			HEAD,
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.replaced[0]?.owner).toEqual({ lessonId: null, moduleId: 21 });
		expect(calls.recalculated).toEqual([undefined]);
	});

	test("reescribir una que ya existe no recalcula", async () => {
		const { service, calls } = createHarness({
			editable: { status: "PUBLISHED" },
		});

		await service.saveBank(COURSE_DOC, { ...bankDto, ...MODULE_OWNER }, HEAD);

		expect(calls.replaced).toHaveLength(1);
		expect(calls.recalculated).toEqual([]);
	});

	test("un módulo de otro curso no lleva evaluación", async () => {
		const { service, calls } = createHarness();

		const result = await service.saveBank(
			COURSE_DOC,
			{ ...bankDto, lessonDocumentId: null, moduleDocumentId: OTHER_DOC },
			HEAD,
		);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.MODULE_NOT_FOUND },
		});
		expect(calls.replaced).toEqual([]);
	});

	test("archivarla la deja de contar y recalcula a todo inscrito", async () => {
		const { service, calls } = createHarness({
			editable: { status: "PUBLISHED" },
		});

		const result = await service.archiveModuleQuiz(
			COURSE_DOC,
			{ moduleDocumentId: MODULE_A },
			HEAD,
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.archived).toEqual([9]);
		expect(calls.recalculated).toEqual([undefined]);
		expect(calls.lockedInTransaction).toEqual([true]);
	});

	test("archivar una que no existe falla con error tipado", async () => {
		const { service, calls } = createHarness({ quiz: null });

		expect(
			await service.archiveModuleQuiz(
				COURSE_DOC,
				{ moduleDocumentId: MODULE_A },
				HEAD,
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_NOT_FOUND },
		});
		expect(calls.archived).toEqual([]);
	});

	test("aprobarla recalcula el avance de quien la presenta, sin tocar el resultado", async () => {
		const { service, calls } = createHarness();

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result).toMatchObject({ success: true, data: { passed: true } });
		expect(calls.attempts).toEqual([
			{ number: 1, attempt: expect.objectContaining({ passed: true }) },
		]);
		expect(calls.recalculated).toEqual([[50]]);
		expect(calls.results).toEqual([]);
		expect(calls.progress).toEqual([]);
	});

	test("reprobarla guarda el intento y no mueve el avance", async () => {
		const { service, calls } = createHarness();

		await service.submit(COURSE_DOC, submitDto(WRONG), ANA);

		expect(calls.attempts).toHaveLength(1);
		expect(calls.recalculated).toEqual([]);
	});

	test("se presenta aunque falten lecciones: cuando quiera", async () => {
		const { service, calls } = createHarness({
			course: classroomCourseOf({
				requiresEvaluation: false,
				evaluationMethod: "MANUAL",
				enrollment: {
					status: "ENROLLED",
					progressPercent: 0,
					contentCompletedAt: null,
					completed: false,
				},
			}),
		});

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result.success).toBe(true);
		expect(calls.attempts).toHaveLength(1);
	});

	test("reprobada y sin otro intento, no se vuelve a presentar", async () => {
		const { service, calls } = createHarness({ attempt: attemptOf() });

		expect(
			await service.submit(COURSE_DOC, submitDto(RIGHT), ANA),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN },
		});
		expect(calls.attempts).toEqual([]);
	});

	test("con otro intento habilitado se presenta como el siguiente número", async () => {
		const { service, calls } = createHarness({
			attempt: attemptOf({ number: 1, retakeGrantedAt: NOW }),
		});

		await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(calls.attempts.map((row) => row.number)).toEqual([2]);
	});

	test("la vista enseña el intento anterior junto con la hoja nueva", async () => {
		const { service } = createHarness({
			attempt: attemptOf({ score: 40, retakeGrantedAt: NOW }),
		});

		const result = await service.findView(COURSE_DOC, MODULE_OWNER, ANA);

		expect(result).toMatchObject({
			success: true,
			data: { availability: "AVAILABLE", outcome: { score: 40 } },
		});
		if (!result.success) throw new Error("se esperaba éxito");
		expect(result.data?.sheet).not.toBeNull();
	});
});

describe("otro intento (docs/adr/0016)", () => {
	const dto = { moduleDocumentId: MODULE_A, userDocumentId: ANA.documentId };

	test("quien imparte lo habilita sobre el último intento reprobado", async () => {
		const { service, calls } = createHarness({ attempt: attemptOf() });

		const result = await service.grantRetake(COURSE_DOC, dto, TRAINER);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.retakes).toEqual([{ attemptId: 5, actorId: 70 }]);
	});

	test.each([
		["aprobado", attemptOf({ passed: true, score: 90 })],
		["con otro ya habilitado", attemptOf({ retakeGrantedAt: NOW })],
		["sin presentar", null],
	])("sobre un intento %s se rechaza", async (_, attempt) => {
		const { service, calls } = createHarness({ attempt });

		expect(await service.grantRetake(COURSE_DOC, dto, TRAINER)).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED },
		});
		expect(calls.retakes).toEqual([]);
	});

	test("en un curso que ya no está en curso se rechaza", async () => {
		const { service, calls } = createHarness({
			attempt: attemptOf(),
			teaching: {
				id: 7,
				status: "FINISHED",
				format: "SCHEDULED",
				dependencyId: 3,
			},
		});

		expect(await service.grantRetake(COURSE_DOC, dto, TRAINER)).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED },
		});
		expect(calls.retakes).toEqual([]);
	});

	test("a quien ya no está inscrito no se le habilita", async () => {
		const { service, calls } = createHarness({
			attempt: attemptOf(),
			enrolledUserId: null,
		});

		expect(await service.grantRetake(COURSE_DOC, dto, TRAINER)).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_PARTICIPANT_NOT_FOUND },
		});
		expect(calls.retakes).toEqual([]);
	});

	test("sin alcance de impartición el curso no existe", async () => {
		const { service, calls } = createHarness({ attempt: attemptOf() });

		expect(await service.grantRetake(COURSE_DOC, dto, NOBODY)).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.COURSE_NOT_FOUND },
		});
		expect(calls.retakes).toEqual([]);
	});

	test("el tablero dice si se puede habilitar y trae el último intento de cada quien", async () => {
		const latest: ModuleQuizAttemptRow = {
			quizDocumentId: quizOf().documentId,
			userDocumentId: ANA.documentId,
			number: 1,
			score: 40,
			passed: false,
			retakeGrantedAt: null,
		};
		const { service } = createHarness({ moduleAttempts: [latest] });

		expect(
			await service.findModuleQuizBoard(COURSE_DOC, TRAINER),
		).toMatchObject({
			success: true,
			data: {
				canGrantRetake: true,
				quizzes: [
					{
						quizDocumentId: quizOf().documentId,
						moduleDocumentId: MODULE_A,
						moduleTitle: "Fundamentos",
						title: "Evaluación",
					},
				],
				attempts: [latest],
			},
		});
	});
});
