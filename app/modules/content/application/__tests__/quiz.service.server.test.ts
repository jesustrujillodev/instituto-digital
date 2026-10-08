import { describe, expect, test } from "vitest";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { ResultWrite } from "@/modules/enrollments/domain/enrollment.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { JOB_NAMES } from "@/shared/queue/queue.config";
import {
	actorOf,
	COURSE_DOC,
	LESSON_1,
	MODULE_A,
	OTHER_DOC,
} from "../../domain/__tests__/content.fixtures";
import type { ClassroomCourse } from "../../domain/classroom.types";
import { CONTENT_ERROR_CODES } from "../../domain/content.errors";
import { FINAL_QUIZ_OWNER, followUpOwnerOf } from "../../domain/quiz.rules";
import type {
	GradedAttempt,
	QuizAttemptRow,
	QuizBankWrite,
	QuizOwnerIds,
	QuizParticipantRef,
	QuizTeachingCourseRef,
	StoredAttempt,
	StoredFollowUp,
	StoredQuiz,
} from "../../domain/quiz.types";
import { createQuizService } from "../quiz.service.server";

const NOW = new Date("2027-03-10T18:00:00.000Z");
const ANA = actorOf({ userId: 50, role: "USER" });
const HEAD = actorOf();
const TRAINER = actorOf({ userId: 70, role: "USER", isTrainer: true });
const NOBODY = actorOf({ userId: 80, role: "USER", isTrainer: false });
const MODULE_OWNER = {
	lessonDocumentId: null,
	moduleDocumentId: MODULE_A,
	followUpDocumentId: null,
};
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

const quizOf = (overrides: Partial<StoredQuiz> = {}): StoredQuiz => ({
	id: 9,
	documentId: "99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	title: "Examen final",
	passingScore: 70,
	maxAttempts: 1,
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
	...overrides,
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
	minPassingGrade: 70,
	qrClosesAfterMinutes: 15,
	enrollment: {
		status: "ENROLLED",
		progressPercent: 100,
		contentCompletedAt: new Date("2027-03-01T00:00:00Z"),
		result: "PENDING",
		completed: false,
	},
	...overrides,
});

const SESSION = {
	id: 3,
	documentId: "33333333-3333-4333-8333-333333333333",
	startsAt: new Date("2027-03-10T17:00:00.000Z"),
	endsAt: new Date("2027-03-10T19:00:00.000Z"),
};
const FOLLOW_UP_DOC = "44444444-4444-4444-8444-444444444444";

/** Una evaluación de seguimiento de la sesión, abierta a la hora del test. */
const followUpOf = (
	overrides: Partial<StoredFollowUp> = {},
): StoredFollowUp => ({
	id: 40,
	documentId: FOLLOW_UP_DOC,
	title: "Práctica de campo",
	passingScore: 60,
	maxAttempts: 1,
	shuffleQuestions: false,
	countsTowardGrade: true,
	availability: "SESSION_START",
	opensBeforeMinutes: null,
	closesAfterMinutes: null,
	openedAt: null,
	closedAt: null,
	session: SESSION,
	questionCount: 1,
	attemptCount: 0,
	...overrides,
});

const BOARD_ENTRY = {
	quizDocumentId: quizOf().documentId,
	owner: MODULE_OWNER,
	kind: "MODULE" as const,
	ownerTitle: "Fundamentos",
	title: "Evaluación",
	maxAttempts: 1,
};

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
		editable?: {
			status: CourseStatus;
			format?: "SCHEDULED" | "SELF_PACED";
		} | null;
		quiz?: StoredQuiz | null;
		attempt?: StoredAttempt | null;
		attemptCount?: number;
		lessonType?: string;
		/** El curso visto por quien imparte; `null` finge que no lo imparte. */
		teaching?: QuizTeachingCourseRef | null;
		participant?: QuizParticipantRef | null;
		attempts?: QuizAttemptRow[];
		followUps?: StoredFollowUp[];
		followUpBanks?: (StoredQuiz & { attemptCount: number })[];
		/** Sesiones con asistencia de quien presenta. */
		attended?: number[];
		/** La sesión del curso que se busca; `null` finge que es de otro. */
		sessionId?: number | null;
		/** El limitador niega el siguiente envío. */
		rateLimited?: boolean;
	} = {},
) => {
	let inTransaction = false;
	const calls = {
		replaced: [] as { owner: QuizOwnerIds; bank: QuizBankWrite }[],
		renamed: [] as string[],
		deletedQuizzes: [] as number[],
		attempts: [] as { number: number; attempt: GradedAttempt }[],
		retakes: [] as { attemptId: number; actorId: number }[],
		results: [] as ResultWrite[][],
		progress: [] as string[],
		recalculated: [] as (readonly number[] | undefined)[],
		lockedInTransaction: [] as boolean[],
		followUpsCreated: [] as unknown[],
		followUpsUpdated: [] as unknown[],
		followUpsDeleted: [] as number[],
		opened: [] as number[],
		closed: [] as number[],
		rateKeys: [] as string[],
	};
	const followUps = options.followUps ?? [];
	const quiz = options.quiz === undefined ? quizOf() : options.quiz;

	const contentRepository = {
		findCourse: async () =>
			options.editable === null
				? null
				: {
						id: 7,
						status: options.editable?.status ?? "DRAFT",
						format: options.editable?.format ?? "SELF_PACED",
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
		deleteQuiz: async (quizId: number) => {
			calls.deletedQuizzes.push(quizId);
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
				? {
						id: 7,
						status: "PUBLISHED",
						format: "SCHEDULED",
						dependencyId: 3,
						completionRule: "ATTENDANCE",
						requiresEvaluation: false,
						minPassingGrade: 70,
					}
				: options.teaching,
		findEnrolledParticipant: async (_courseId: number, documentId: string) =>
			documentId === ANA.documentId
				? options.participant === undefined
					? { userId: 50, result: "PENDING", completed: false }
					: options.participant
				: null,
		findBoardQuizzes: async () => [BOARD_ENTRY],
		findLatestAttempts: async () => options.attempts ?? [],
		findFollowUps: async () => followUps,
		findFollowUpBanks: async () => options.followUpBanks ?? [],
		findFollowUp: async (_courseId: number, documentId: string) =>
			followUps.find((row) => row.documentId === documentId) ?? null,
		findSessionId: async () =>
			options.sessionId === undefined ? SESSION.id : options.sessionId,
		createFollowUp: async (_courseId: number, write: unknown) => {
			calls.followUpsCreated.push(write);
			return { id: 40, documentId: FOLLOW_UP_DOC };
		},
		updateFollowUp: async (_id: number, write: unknown) => {
			calls.followUpsUpdated.push(write);
		},
		deleteFollowUp: async (id: number) => {
			calls.followUpsDeleted.push(id);
		},
		openFollowUp: async (id: number) => {
			calls.opened.push(id);
		},
		closeFollowUp: async (id: number) => {
			calls.closed.push(id);
		},
		findFollowUpBestScores: async () => [],
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
		teachingRepository: {
			findAttendedSessionIds: async () => options.attended ?? [SESSION.id],
		} as unknown as ICradle["teachingRepository"],
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
		// El recálculo de todo el curso sale por la cola: sin `userIds`, como el
		// de `progressSync` al que sustituye.
		jobDispatcher: {
			dispatch: async (name: string) => {
				if (name === JOB_NAMES.recalculateProgress) {
					calls.recalculated.push(undefined);
				}
			},
		} as unknown as ICradle["jobDispatcher"],
		rateLimiter: {
			consume: async (key: string) => {
				calls.rateKeys.push(key);
				return options.rateLimited
					? { allowed: false, retryAfterMs: 40_000 }
					: { allowed: true, retryAfterMs: 0 };
			},
		} as unknown as ICradle["rateLimiter"],
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
	maxAttempts: 1,
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
					maxAttempts: 1,
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

	// La nota la calcula `progressSync`, por la misma vía que el resto
	// (docs/adr/0024, 0027): aquí solo se comprueba que se recalcula.
	test("guarda el intento y recalcula la nota de quien lo presentó", async () => {
		const { service, calls } = createHarness();

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result).toMatchObject({
			success: true,
			data: { score: 100, passed: true, questions: [{ correct: true }] },
		});
		expect(calls.attempts.map((row) => row.number)).toEqual([1]);
		expect(calls.recalculated).toEqual([[50]]);
		expect(calls.lockedInTransaction).toEqual([true]);
	});

	test("reprobar también guarda el intento y recalcula", async () => {
		const { service, calls } = createHarness();

		const result = await service.submit(COURSE_DOC, submitDto(WRONG), ANA);

		expect(result).toMatchObject({ success: true, data: { passed: false } });
		expect(calls.recalculated).toEqual([[50]]);
	});

	test("con intentos restantes se presenta como el siguiente número", async () => {
		const { service, calls } = createHarness({
			course: classroomCourseOf({
				format: "SCHEDULED",
				completionRule: "ATTENDANCE",
			}),
			quiz: quizOf({ maxAttempts: 2 }),
			attempt: attemptOf({ score: 50, passed: false }),
		});

		await service.submit(COURSE_DOC, submitDto(WRONG), ANA);

		expect(calls.attempts.map((row) => row.number)).toEqual([2]);
	});

	test("sin intentos restantes, otro envío se rechaza y no escribe", async () => {
		const { service, calls } = createHarness({
			attempt: attemptOf(),
		});

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN },
		});
		expect(calls.attempts).toEqual([]);
		expect(calls.recalculated).toEqual([]);
	});

	test("con el contenido sin terminar todavía no se presenta", async () => {
		const { service, calls } = createHarness({
			course: classroomCourseOf({
				enrollment: {
					status: "ENROLLED",
					progressPercent: 50,
					contentCompletedAt: null,
					result: "PENDING",
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

	test("sin evaluación final el examen no se presenta", async () => {
		const { service } = createHarness({
			course: classroomCourseOf({ requiresEvaluation: false }),
		});

		expect(
			await service.submit(COURSE_DOC, submitDto(RIGHT), ANA),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_NOT_EVALUATED },
		});
	});
});

describe("submit: límite de envíos", () => {
	const submitDto = {
		...FINAL_QUIZ_OWNER,
		answers: [{ questionDocumentId: Q1, optionDocumentId: RIGHT }],
	};

	test("al rebasarlo falla sin bloquear el curso ni guardar el intento", async () => {
		const { service, calls } = createHarness({ rateLimited: true });

		const result = await service.submit(COURSE_DOC, submitDto, ANA);

		expect(result).toMatchObject({
			success: false,
			error: {
				code: CONTENT_ERROR_CODES.QUIZ_RATE_LIMITED,
				details: { retryAfterMs: 40_000 },
			},
		});
		expect(calls.lockedInTransaction).toEqual([]);
		expect(calls.attempts).toEqual([]);
	});

	test("cuenta por persona y curso", async () => {
		const { service, calls } = createHarness();

		await service.submit(COURSE_DOC, submitDto, ANA);

		expect(calls.rateKeys).toEqual([`quiz-submit:50:${COURSE_DOC}`]);
	});
});

describe("submit: práctica (docs/adr/0021, 0024)", () => {
	const submitDto = (optionDocumentId: string) => ({
		lessonDocumentId: LESSON_1,
		moduleDocumentId: null,
		followUpDocumentId: null,
		answers: [{ questionDocumentId: Q1, optionDocumentId }],
	});

	test("aprobarla completa la lección, sin tocar el resultado", async () => {
		const { service, calls } = createHarness();

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result).toMatchObject({ success: true, data: { passed: true } });
		expect(calls.progress).toEqual(["COMPLETED"]);
		expect(calls.recalculated).toEqual([[50]]);
		expect(calls.results).toEqual([]);
	});

	test("reprobarla también completa la lección y recalcula", async () => {
		const { service, calls } = createHarness();

		const result = await service.submit(COURSE_DOC, submitDto(WRONG), ANA);

		expect(result).toMatchObject({ success: true, data: { passed: false } });
		expect(calls.attempts).toHaveLength(1);
		expect(calls.progress).toEqual(["COMPLETED"]);
		expect(calls.recalculated).toEqual([[50]]);
		expect(calls.results).toEqual([]);
	});

	test("sin límite, reprobada se reintenta sin que nadie lo habilite", async () => {
		const { service, calls } = createHarness({
			quiz: quizOf({ maxAttempts: null }),
			attempt: attemptOf({ passed: false, score: 0, number: 4 }),
		});

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result).toMatchObject({ success: true, data: { passed: true } });
		expect(calls.attempts).toEqual([
			{ number: 5, attempt: expect.objectContaining({ passed: true }) },
		]);
		expect(calls.progress).toEqual(["COMPLETED"]);
	});

	test("con el tope agotado, reprobada no se vuelve a presentar", async () => {
		const { service, calls } = createHarness({
			attempt: attemptOf({ passed: false, score: 0 }),
		});

		expect(
			await service.submit(COURSE_DOC, submitDto(RIGHT), ANA),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN },
		});
		expect(calls.attempts).toEqual([]);
	});

	test("aprobada, un segundo envío se rechaza", async () => {
		const { service, calls } = createHarness({
			attempt: attemptOf({ passed: true, score: 100 }),
		});

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN },
		});
		expect(calls.attempts).toEqual([]);
	});
});

describe("findView", () => {
	// La página de un seguimiento que no abre dice cuándo se abre; si es manual,
	// solo lo sabe quien imparte.
	// Sin asistencia, la página solo invita a escanear mientras el QR sigue abierto.
	test("sin asistencia, dice si el QR de la sesión ya cerró", async () => {
		const owner = followUpOwnerOf(FOLLOW_UP_DOC);
		const ended = {
			...SESSION,
			startsAt: new Date(NOW.getTime() - 4 * 3_600_000),
			endsAt: new Date(NOW.getTime() - 3 * 3_600_000),
		};
		const late = createHarness({
			attended: [],
			followUps: [
				followUpOf({
					availability: "RANGE",
					opensBeforeMinutes: 0,
					closesAfterMinutes: 600,
					session: ended,
				}),
			],
		});
		const during = createHarness({
			attended: [],
			followUps: [followUpOf()],
		});

		expect(await late.service.findView(COURSE_DOC, owner, ANA)).toMatchObject({
			success: true,
			data: { availability: "NOT_ATTENDED", checkInClosed: true },
		});
		expect(await during.service.findView(COURSE_DOC, owner, ANA)).toMatchObject(
			{
				success: true,
				data: { availability: "NOT_ATTENDED", checkInClosed: false },
			},
		);
	});

	test("un seguimiento automático trae cuándo se abre; el manual sin abrir, no", async () => {
		const owner = followUpOwnerOf(FOLLOW_UP_DOC);
		const tomorrow = {
			...SESSION,
			startsAt: new Date(NOW.getTime() + 24 * 3_600_000),
			endsAt: new Date(NOW.getTime() + 26 * 3_600_000),
		};
		const automatic = createHarness({
			followUps: [followUpOf({ session: tomorrow })],
		});
		const manual = createHarness({
			followUps: [followUpOf({ availability: "MANUAL" })],
		});

		expect(
			await automatic.service.findView(COURSE_DOC, owner, ANA),
		).toMatchObject({
			success: true,
			data: { availability: "NOT_YET", opensAt: tomorrow.startsAt },
		});
		expect(await manual.service.findView(COURSE_DOC, owner, ANA)).toMatchObject(
			{ success: true, data: { availability: "NOT_YET", opensAt: null } },
		);
		expect(
			await automatic.service.findView(COURSE_DOC, FINAL_QUIZ_OWNER, ANA),
		).toMatchObject({ success: true, data: { opensAt: null } });
	});

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
				canRequestRetake: true,
			},
		});
		expect(JSON.stringify(result)).not.toContain("isCorrect");
	});

	test("con intentos restantes, la hoja dice cuántos quedan", async () => {
		const { service } = createHarness({
			quiz: quizOf({ maxAttempts: 3 }),
			attempt: attemptOf({ score: 40 }),
		});

		const result = await service.findView(COURSE_DOC, FINAL_QUIZ_OWNER, ANA);

		expect(result).toMatchObject({
			success: true,
			data: {
				availability: "AVAILABLE",
				sheet: { attemptsLeft: 2 },
				outcome: { score: 40 },
				canRequestRetake: false,
			},
		});
	});

	test("ya acreditado, lo reprobado se cierra y no se pide otro", async () => {
		const { service } = createHarness({
			course: classroomCourseOf({
				enrollment: {
					status: "ENROLLED",
					progressPercent: 100,
					contentCompletedAt: new Date("2027-03-01T00:00:00Z"),
					result: "PASSED",
					completed: true,
				},
			}),
			quiz: quizOf({ maxAttempts: 3 }),
			attempt: attemptOf({ score: 40 }),
		});

		expect(
			await service.findView(COURSE_DOC, FINAL_QUIZ_OWNER, ANA),
		).toMatchObject({
			success: true,
			data: { availability: "TAKEN", sheet: null, canRequestRetake: false },
		});
	});

	test("un curso sin evaluación final no enseña examen", async () => {
		const { service } = createHarness({
			course: classroomCourseOf({ requiresEvaluation: false }),
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

	test("en borrador eliminarla la borra, sin avance que recalcular", async () => {
		const { service, calls } = createHarness();

		const result = await service.deleteModuleQuiz(
			COURSE_DOC,
			{ moduleDocumentId: MODULE_A },
			HEAD,
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.deletedQuizzes).toEqual([9]);
		expect(calls.recalculated).toEqual([]);
	});

	test("publicada la capacitación, ya no se elimina", async () => {
		const { service, calls } = createHarness({
			editable: { status: "PUBLISHED" },
		});

		expect(
			await service.deleteModuleQuiz(
				COURSE_DOC,
				{ moduleDocumentId: MODULE_A },
				HEAD,
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.DELETE_LOCKED },
		});
		expect(calls.deletedQuizzes).toEqual([]);
	});

	test("eliminar una que no existe falla con error tipado", async () => {
		const { service, calls } = createHarness({ quiz: null });

		expect(
			await service.deleteModuleQuiz(
				COURSE_DOC,
				{ moduleDocumentId: MODULE_A },
				HEAD,
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_NOT_FOUND },
		});
		expect(calls.deletedQuizzes).toEqual([]);
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

	// ADR-0024: presentada cuenta para el avance, apruebe o no.
	test("reprobarla también recalcula el avance de quien la presenta", async () => {
		const { service, calls } = createHarness();

		await service.submit(COURSE_DOC, submitDto(WRONG), ANA);

		expect(calls.attempts).toHaveLength(1);
		expect(calls.recalculated).toEqual([[50]]);
		expect(calls.results).toEqual([]);
	});

	test("se presenta aunque falten lecciones: cuando quiera", async () => {
		const { service, calls } = createHarness({
			course: classroomCourseOf({
				requiresEvaluation: false,
				enrollment: {
					status: "ENROLLED",
					progressPercent: 0,
					contentCompletedAt: null,
					result: "PENDING",
					completed: false,
				},
			}),
		});

		const result = await service.submit(COURSE_DOC, submitDto(RIGHT), ANA);

		expect(result.success).toBe(true);
		expect(calls.attempts).toHaveLength(1);
	});

	test("reprobada, sin intentos ni otro habilitado, no se vuelve a presentar", async () => {
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

describe("otro intento (docs/adr/0016, 0024)", () => {
	const dto = { ...MODULE_OWNER, userDocumentId: ANA.documentId };

	test("quien imparte lo habilita sobre el último reprobado, con los intentos agotados", async () => {
		const { service, calls } = createHarness({ attempt: attemptOf() });

		const result = await service.grantRetake(COURSE_DOC, dto, TRAINER);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.retakes).toEqual([{ attemptId: 5, actorId: 70 }]);
	});

	test("también se habilita en el examen final", async () => {
		const { service, calls } = createHarness({ attempt: attemptOf() });

		const result = await service.grantRetake(
			COURSE_DOC,
			{ ...FINAL_QUIZ_OWNER, userDocumentId: ANA.documentId },
			TRAINER,
		);

		expect(result).toMatchObject({ success: true, data: null });
		expect(calls.retakes).toEqual([{ attemptId: 5, actorId: 70 }]);
	});

	test("con intentos restantes no hace falta y se rechaza", async () => {
		const { service, calls } = createHarness({
			quiz: quizOf({ maxAttempts: 2 }),
			attempt: attemptOf(),
		});

		expect(await service.grantRetake(COURSE_DOC, dto, TRAINER)).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED },
		});
		expect(calls.retakes).toEqual([]);
	});

	test.each([
		["aprobado", { userId: 50, result: "PASSED" as const, completed: false }],
		["completado", { userId: 50, result: "PENDING" as const, completed: true }],
	])("a quien ya acreditó (%s) no se le habilita", async (_, participant) => {
		const { service, calls } = createHarness({
			attempt: attemptOf(),
			participant,
		});

		expect(await service.grantRetake(COURSE_DOC, dto, TRAINER)).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED },
		});
		expect(calls.retakes).toEqual([]);
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
				completionRule: "ATTENDANCE",
				requiresEvaluation: false,
				minPassingGrade: 70,
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
			participant: null,
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
		const latest: QuizAttemptRow = {
			quizDocumentId: quizOf().documentId,
			userDocumentId: ANA.documentId,
			number: 1,
			score: 40,
			passed: false,
			retakeGrantedAt: null,
			maxAttempts: 1,
		};
		const { service } = createHarness({ attempts: [latest] });

		expect(await service.findQuizBoard(COURSE_DOC, TRAINER)).toMatchObject({
			success: true,
			data: {
				canGrantRetake: true,
				quizzes: [BOARD_ENTRY],
				attempts: [latest],
			},
		});
	});
});

describe("evaluaciones de seguimiento (docs/adr/0027)", () => {
	const SCHEDULED = { status: "DRAFT" as const, format: "SCHEDULED" as const };
	const settings = {
		sessionDocumentId: "33333333-3333-4333-8333-333333333333",
		countsTowardGrade: true,
		availability: "RANGE" as const,
		opensBeforeMinutes: 10,
		closesAfterMinutes: 20,
	};
	const saveDto = (overrides: object = {}) => ({
		title: "Práctica de campo",
		passingScore: 70,
		maxAttempts: 1,
		shuffleQuestions: false,
		...settings,
		followUpDocumentId: null,
		...overrides,
	});
	const questionsDto = {
		followUpDocumentId: FOLLOW_UP_DOC,
		questions: bankDto.questions,
	};
	const FOLLOW_UP_OWNER = { lessonId: null, moduleId: null, followUpId: 40 };

	test("los bancos de todas se leen juntos, por evaluación", async () => {
		const { service } = createHarness({
			editable: SCHEDULED,
			followUpBanks: [
				{ ...quizOf({ id: 40, documentId: FOLLOW_UP_DOC }), attemptCount: 2 },
			],
		});

		const result = await service.findFollowUpBanks(COURSE_DOC, HEAD);

		expect(result).toMatchObject({
			success: true,
			data: {
				[FOLLOW_UP_DOC]: { documentId: FOLLOW_UP_DOC, attemptCount: 2 },
			},
		});
	});

	test("los bancos de un curso que no administra no se leen", async () => {
		const { service } = createHarness({ editable: null });

		const result = await service.findFollowUpBanks(COURSE_DOC, HEAD);

		expect(result).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.COURSE_NOT_FOUND },
		});
	});

	test("crearla desde el modal la deja sin preguntas", async () => {
		const { service, calls } = createHarness({ editable: SCHEDULED });

		const result = await service.saveFollowUp(COURSE_DOC, saveDto(), HEAD);

		expect(result).toMatchObject({
			success: true,
			data: { documentId: FOLLOW_UP_DOC },
		});
		expect(calls.followUpsCreated).toEqual([
			{
				title: "Práctica de campo",
				sessionId: SESSION.id,
				countsTowardGrade: true,
				availability: "RANGE",
				opensBeforeMinutes: 10,
				closesAfterMinutes: 20,
				passingScore: 70,
				maxAttempts: 1,
				shuffleQuestions: false,
			},
		]);
		expect(calls.replaced).toEqual([]);
		expect(calls.lockedInTransaction).toEqual([true]);
	});

	// Las preguntas se guardan con el paso, sin tocar lo que puso el modal.
	test("sus preguntas se escriben con los datos que ya tiene", async () => {
		const { service, calls } = createHarness({
			editable: SCHEDULED,
			followUps: [followUpOf({ passingScore: 60, maxAttempts: 2 })],
		});

		const result = await service.saveFollowUpQuestions(
			COURSE_DOC,
			questionsDto,
			HEAD,
		);

		expect(result.success).toBe(true);
		expect(calls.replaced).toEqual([
			{
				owner: FOLLOW_UP_OWNER,
				bank: expect.objectContaining({
					title: "Práctica de campo",
					passingScore: 60,
					maxAttempts: 2,
					questions: [expect.objectContaining({ statement: "¿Cuál?" })],
				}),
			},
		]);
		expect(calls.lockedInTransaction).toEqual([true]);
	});

	test("con intentos sus preguntas ya no cambian", async () => {
		const { service, calls } = createHarness({
			editable: SCHEDULED,
			followUps: [followUpOf({ attemptCount: 1 })],
		});

		expect(
			await service.saveFollowUpQuestions(COURSE_DOC, questionsDto, HEAD),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_LOCKED },
		});
		expect(calls.replaced).toEqual([]);
	});

	test("un autogestivo no tiene seguimiento", async () => {
		const { service, calls } = createHarness({
			editable: { status: "DRAFT", format: "SELF_PACED" },
		});

		expect(
			await service.saveFollowUp(COURSE_DOC, saveDto(), HEAD),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.FOLLOW_UP_SELF_PACED },
		});
		expect(calls.followUpsCreated).toEqual([]);
	});

	test("una sesión de otro curso se rechaza", async () => {
		const { service } = createHarness({ editable: SCHEDULED, sessionId: null });

		expect(
			await service.saveFollowUp(COURSE_DOC, saveDto(), HEAD),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.SESSION_NOT_FOUND },
		});
	});

	test("con el tope alcanzado no se crea otra", async () => {
		const { service, calls } = createHarness({
			editable: SCHEDULED,
			followUps: Array.from({ length: 20 }, (_, index) =>
				followUpOf({ id: index + 1 }),
			),
		});

		expect(
			await service.saveFollowUp(COURSE_DOC, saveDto(), HEAD),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.TOO_MANY_FOLLOW_UPS },
		});
		expect(calls.replaced).toEqual([]);
	});

	test("editarla desde el modal no toca sus preguntas", async () => {
		const { service, calls } = createHarness({
			editable: SCHEDULED,
			followUps: [followUpOf()],
		});

		const result = await service.saveFollowUp(
			COURSE_DOC,
			saveDto({ followUpDocumentId: FOLLOW_UP_DOC, title: "Práctica 2" }),
			HEAD,
		);

		expect(result.success).toBe(true);
		expect(calls.followUpsCreated).toEqual([]);
		expect(calls.followUpsUpdated).toEqual([
			expect.objectContaining({ title: "Práctica 2", availability: "RANGE" }),
		]);
		expect(calls.replaced).toEqual([]);
	});

	test("con intentos no cambian la mínima ni si cuenta, pero sí su ventana", async () => {
		const followUps = [followUpOf({ attemptCount: 2 })];
		const locked = createHarness({ editable: SCHEDULED, followUps });

		expect(
			await locked.service.saveFollowUp(
				COURSE_DOC,
				saveDto({
					followUpDocumentId: FOLLOW_UP_DOC,
					countsTowardGrade: false,
				}),
				HEAD,
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_LOCKED },
		});
		expect(locked.calls.followUpsUpdated).toEqual([]);

		const minimum = createHarness({ editable: SCHEDULED, followUps });
		expect(
			await minimum.service.saveFollowUp(
				COURSE_DOC,
				saveDto({ followUpDocumentId: FOLLOW_UP_DOC, passingScore: 90 }),
				HEAD,
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.QUIZ_LOCKED },
		});

		const open = createHarness({ editable: SCHEDULED, followUps });
		const result = await open.service.saveFollowUp(
			COURSE_DOC,
			saveDto({
				followUpDocumentId: FOLLOW_UP_DOC,
				passingScore: 60,
				closesAfterMinutes: 45,
			}),
			HEAD,
		);
		expect(result.success).toBe(true);
		expect(open.calls.followUpsUpdated).toHaveLength(1);
	});

	test("eliminarla solo mientras nadie la presentó", async () => {
		const free = createHarness({
			editable: SCHEDULED,
			followUps: [followUpOf()],
		});
		await free.service.removeFollowUp(
			COURSE_DOC,
			{ followUpDocumentId: FOLLOW_UP_DOC },
			HEAD,
		);
		expect(free.calls.followUpsDeleted).toEqual([40]);

		const taken = createHarness({
			editable: SCHEDULED,
			followUps: [followUpOf({ attemptCount: 1 })],
		});
		expect(
			await taken.service.removeFollowUp(
				COURSE_DOC,
				{ followUpDocumentId: FOLLOW_UP_DOC },
				HEAD,
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.FOLLOW_UP_HAS_ATTEMPTS },
		});
		expect(taken.calls.followUpsDeleted).toEqual([]);
	});

	test("abrir a mano una que no es manual se rechaza", async () => {
		const { service, calls } = createHarness({ followUps: [followUpOf()] });

		expect(
			await service.openFollowUp(
				COURSE_DOC,
				{ followUpDocumentId: FOLLOW_UP_DOC },
				TRAINER,
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.FOLLOW_UP_NOT_MANUAL },
		});
		expect(calls.opened).toEqual([]);
	});

	test("abrir una manual la deja abierta", async () => {
		const { service, calls } = createHarness({
			followUps: [followUpOf({ availability: "MANUAL" })],
		});

		const result = await service.openFollowUp(
			COURSE_DOC,
			{ followUpDocumentId: FOLLOW_UP_DOC },
			TRAINER,
		);

		expect(result.success).toBe(true);
		expect(calls.opened).toEqual([40]);
	});

	test("cerrar una que cuenta recalcula la nota de todos", async () => {
		const { service, calls } = createHarness({
			followUps: [followUpOf({ availability: "MANUAL", openedAt: NOW })],
		});

		const result = await service.closeFollowUp(
			COURSE_DOC,
			{ followUpDocumentId: FOLLOW_UP_DOC },
			TRAINER,
		);

		expect(result.success).toBe(true);
		expect(calls.closed).toEqual([40]);
		expect(calls.recalculated).toEqual([undefined]);
	});

	test("cerrar es definitivo", async () => {
		const { service } = createHarness({
			followUps: [
				followUpOf({ availability: "MANUAL", openedAt: NOW, closedAt: NOW }),
			],
		});

		expect(
			await service.closeFollowUp(
				COURSE_DOC,
				{ followUpDocumentId: FOLLOW_UP_DOC },
				TRAINER,
			),
		).toMatchObject({
			success: false,
			error: { code: CONTENT_ERROR_CODES.FOLLOW_UP_CLOSED },
		});
	});

	describe("presentarla", () => {
		const scheduledCourse = classroomCourseOf({
			format: "SCHEDULED",
			completionRule: "ATTENDANCE",
			requiresEvaluation: false,
		});
		const submitDto = {
			...followUpOwnerOf(FOLLOW_UP_DOC),
			answers: [{ questionDocumentId: Q1, optionDocumentId: RIGHT }],
		};

		test("abierta y con asistencia, guarda el intento y recalcula la nota", async () => {
			const { service, calls } = createHarness({
				course: scheduledCourse,
				followUps: [followUpOf()],
			});

			const result = await service.submit(COURSE_DOC, submitDto, ANA);

			expect(result).toMatchObject({ success: true, data: { score: 100 } });
			expect(calls.attempts.map((row) => row.number)).toEqual([1]);
			expect(calls.recalculated).toEqual([[50]]);
		});

		test("sin asistencia en su sesión se rechaza", async () => {
			const { service, calls } = createHarness({
				course: scheduledCourse,
				followUps: [followUpOf()],
				attended: [],
			});

			expect(await service.submit(COURSE_DOC, submitDto, ANA)).toMatchObject({
				success: false,
				error: { code: CONTENT_ERROR_CODES.FOLLOW_UP_NOT_ATTENDED },
			});
			expect(calls.attempts).toEqual([]);
		});

		test("fuera de su ventana se rechaza", async () => {
			const { service, calls } = createHarness({
				course: scheduledCourse,
				followUps: [followUpOf({ availability: "MANUAL" })],
			});

			expect(await service.submit(COURSE_DOC, submitDto, ANA)).toMatchObject({
				success: false,
				error: { code: CONTENT_ERROR_CODES.FOLLOW_UP_NOT_OPEN },
			});
			expect(calls.attempts).toEqual([]);
		});
	});

	test("sin inscripción vigente el participante no ve ninguna", async () => {
		const { service } = createHarness({
			course: classroomCourseOf({ format: "SCHEDULED", enrollment: null }),
			followUps: [followUpOf()],
		});

		expect(
			await service.findParticipantFollowUps(COURSE_DOC, ANA),
		).toMatchObject({ success: true, data: [] });
	});
});
