import { describe, expect, test } from "vitest";
import type {
	CourseCompletionRule,
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type {
	ProgressWrite,
	ResultWrite,
	ProgressState as StoredProgress,
} from "@/modules/enrollments/domain/enrollment.types";
import type { ICradle } from "@/shared/di/container.types";
import {
	LESSON_1,
	LESSON_2,
	LESSON_3,
	MODULE_A,
	MODULE_QUIZ_A,
} from "../../domain/__tests__/content.fixtures";
import type { CompletedLessonRow } from "../../domain/classroom.types";
import type { ContentModuleRaw } from "../../domain/content.mapper";
import type {
	FollowUpScoreRow,
	QuizScoreRow,
	StoredFollowUp,
} from "../../domain/quiz.types";
import { createProgressSync } from "../progress-sync.server";

const AT = new Date("2027-03-10T18:00:00.000Z");
const EARLIER = new Date("2027-01-05T18:00:00.000Z");

const stateOf = (
	userId: number,
	progressPercent: number,
	contentCompletedAt: Date | null,
	overrides: Partial<StoredProgress> = {},
): StoredProgress => ({
	userId,
	progressPercent,
	contentCompletedAt,
	result: "PENDING",
	grade: null,
	completed: false,
	...overrides,
});

const lessonRaw = (documentId: string, order: number) => ({
	documentId,
	title: `Lección ${order}`,
	type: "TEXT" as const,
	order,
	isRequired: true,
	estimatedMinutes: null,
	content: null,
	quiz: null,
});

const treeOf = (lessons: string[], withQuiz: boolean): ContentModuleRaw[] => [
	{
		documentId: MODULE_A,
		title: "Fundamentos",
		description: null,
		order: 1,
		lessons: lessons.map((documentId, index) =>
			lessonRaw(documentId, index + 1),
		),
		quizzes: withQuiz
			? [
					{
						documentId: MODULE_QUIZ_A,
						title: "Evaluación",
						maxAttempts: 2,
						_count: { questions: 2 },
					},
				]
			: [],
	},
];

const SESSION = {
	id: 3,
	documentId: "33333333-3333-4333-8333-333333333333",
	startsAt: new Date("2027-03-01T16:00:00.000Z"),
	endsAt: new Date("2027-03-01T18:00:00.000Z"),
};

/** Una evaluación de seguimiento; por defecto cuenta y abre con la sesión. */
const followUpOf = (
	overrides: Partial<StoredFollowUp> = {},
): StoredFollowUp => ({
	id: 40,
	documentId: "44444444-4444-4444-8444-444444444444",
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
	questionCount: 2,
	attemptCount: 0,
	...overrides,
});

const followUpScoreOf = (
	userId: number,
	score: number,
	quizId = 40,
): FollowUpScoreRow => ({
	quizId,
	quizDocumentId: "44444444-4444-4444-8444-444444444444",
	userId,
	userDocumentId: "55555555-5555-4555-8555-555555555555",
	score,
});

const createHarness = (options: {
	lessons: string[];
	states: StoredProgress[];
	completed: CompletedLessonRow[];
	moduleQuiz?: boolean;
	scores?: QuizScoreRow[];
	finals?: { userId: number; score: number }[];
	followUps?: StoredFollowUp[];
	followUpScores?: FollowUpScoreRow[];
}) => {
	const calls = {
		locks: 0,
		writes: [] as ProgressWrite[][],
		results: [] as { entries: ResultWrite[]; actorId: number; at: Date }[],
		syncs: [] as { courseId: number; actorId: number; at: Date }[],
		order: [] as string[],
	};

	const sync = createProgressSync({
		contentRepository: {
			findTree: async () =>
				treeOf(options.lessons, options.moduleQuiz ?? false),
		} as unknown as ICradle["contentRepository"],
		classroomRepository: {
			findCompletedLessons: async (
				_courseId: number,
				userIds?: readonly number[],
			) =>
				options.completed.filter(
					(row) => !userIds || userIds.includes(row.userId),
				),
		} as unknown as ICradle["classroomRepository"],
		quizRepository: {
			findBestScores: async (_courseId: number, userIds?: readonly number[]) =>
				(options.scores ?? []).filter(
					(row) => !userIds || userIds.includes(row.userId),
				),
			findFinalBestScores: async () => options.finals ?? [],
			findFollowUps: async () => options.followUps ?? [],
			findFollowUpBestScores: async () => options.followUpScores ?? [],
		} as unknown as ICradle["quizRepository"],
		enrollmentRepository: {
			lockCourseSeats: async () => {
				calls.locks += 1;
				return { capacity: null, enrolled: 0 };
			},
			findProgressStates: async () => options.states,
			saveProgress: async (_courseId: number, writes: ProgressWrite[]) => {
				calls.writes.push(writes);
			},
			saveResults: async (
				_courseId: number,
				entries: ResultWrite[],
				actorId: number,
				at: Date,
			) => {
				calls.results.push({ entries, actorId, at });
				calls.order.push("results");
			},
		} as unknown as ICradle["enrollmentRepository"],
		completionSync: {
			sync: async (courseId: number, actorId: number, at: Date) => {
				calls.syncs.push({ courseId, actorId, at });
				calls.order.push("sync");
				return { completed: 0, diff: { grant: [], restore: [], revoke: [] } };
			},
		} as unknown as ICradle["completionSync"],
	});

	return { sync, calls };
};

const courseOf = (
	status: CourseStatus = "PUBLISHED",
	format: CourseFormat = "SELF_PACED",
	evaluation: {
		completionRule?: CourseCompletionRule;
		requiresEvaluation?: boolean;
	} = {},
) => ({
	id: 7,
	status,
	format,
	completionRule: evaluation.completionRule ?? "CONTENT",
	requiresEvaluation: evaluation.requiresEvaluation ?? false,
	minPassingGrade: 70,
});

describe("progressSync.recalculate", () => {
	test("quien termina las obligatorias fija su fecha y un autogestivo lo acredita", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1, LESSON_2],
			states: [stateOf(50, 50, null)],
			completed: [
				{ userId: 50, lessonDocumentId: LESSON_1 },
				{ userId: 50, lessonDocumentId: LESSON_2 },
			],
		});

		const result = await sync.recalculate(courseOf(), 50, AT, [50]);

		expect(result).toEqual([
			{ userId: 50, percent: 100, contentCompleted: true },
		]);
		expect(calls.locks).toBe(1);
		expect(calls.writes).toEqual([
			[{ userId: 50, percent: 100, completedAt: AT }],
		]);
		expect(calls.syncs).toEqual([{ courseId: 7, actorId: 50, at: AT }]);
	});

	// ADR-0016: la evaluación del módulo cuenta como una parada más del contenido.
	test("sin presentar la evaluación del módulo el contenido no termina", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 0, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
		});

		const result = await sync.recalculate(courseOf(), 50, AT, [50]);

		expect(result).toEqual([
			{ userId: 50, percent: 50, contentCompleted: false },
		]);
		expect(calls.syncs).toEqual([]);
	});

	// ADR-0024: presentada cuenta, apruebe o no.
	test("presentarla termina el contenido y un autogestivo lo acredita", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 50, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
			scores: [{ userId: 50, itemDocumentId: MODULE_QUIZ_A, score: 80 }],
		});

		const result = await sync.recalculate(courseOf(), 50, AT, [50]);

		expect(result).toEqual([
			{ userId: 50, percent: 100, contentCompleted: true },
		]);
		expect(calls.writes).toEqual([
			[{ userId: 50, percent: 100, completedAt: AT }],
		]);
		expect(calls.syncs).toEqual([{ courseId: 7, actorId: 50, at: AT }]);
	});

	// ADR-0021, 0024: sin examen ni captura, el temario califica con el promedio.
	test("al terminar, escribe aprobado con el promedio antes de acreditar", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 50, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
			scores: [
				{ userId: 50, itemDocumentId: LESSON_1, score: 95 },
				{ userId: 50, itemDocumentId: MODULE_QUIZ_A, score: 70 },
			],
		});

		await sync.recalculate(courseOf(), 50, AT, [50]);

		expect(calls.results).toEqual([
			{
				entries: [{ userId: 50, result: "PASSED", grade: 82 }],
				actorId: 50,
				at: AT,
			},
		]);
		expect(calls.order).toEqual(["results", "sync"]);
	});

	test("un promedio bajo la mínima escribe reprobado aunque termine", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 50, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
			scores: [
				{ userId: 50, itemDocumentId: LESSON_1, score: 60 },
				{ userId: 50, itemDocumentId: MODULE_QUIZ_A, score: 50 },
			],
		});

		const result = await sync.recalculate(courseOf(), 50, AT, [50]);

		expect(result).toEqual([
			{ userId: 50, percent: 100, contentCompleted: true },
		]);
		expect(calls.results).toEqual([
			{
				entries: [{ userId: 50, result: "FAILED", grade: 55 }],
				actorId: 50,
				at: AT,
			},
		]);
		// Recalcular el completado ya lee el reprobado y no acredita.
		expect(calls.order).toEqual(["results", "sync"]);
	});

	test("un reintento que sube el promedio acredita a quien ya había terminado", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 100, EARLIER, { result: "FAILED", grade: 55 })],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
			scores: [
				{ userId: 50, itemDocumentId: LESSON_1, score: 60 },
				{ userId: 50, itemDocumentId: MODULE_QUIZ_A, score: 90 },
			],
		});

		await sync.recalculate(courseOf(), 50, AT, [50]);

		expect(calls.writes).toEqual([]);
		expect(calls.results).toEqual([
			{
				entries: [{ userId: 50, result: "PASSED", grade: 75 }],
				actorId: 50,
				at: AT,
			},
		]);
		expect(calls.syncs).toEqual([{ courseId: 7, actorId: 50, at: AT }]);
	});

	test("un reintento que no alcanza solo actualiza la nota, sin acreditar", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 100, EARLIER, { result: "FAILED", grade: 55 })],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
			scores: [
				{ userId: 50, itemDocumentId: LESSON_1, score: 60 },
				{ userId: 50, itemDocumentId: MODULE_QUIZ_A, score: 70 },
			],
		});

		await sync.recalculate(courseOf(), 50, AT, [50]);

		expect(calls.results[0]?.entries).toEqual([
			{ userId: 50, result: "FAILED", grade: 65 },
		]);
		expect(calls.syncs).toEqual([]);
	});

	// Solo hacia adelante: con el crédito dado, la nota queda fija.
	test.each([
		["completado", { completed: true }],
		[
			"completado antes de la mínima",
			{ result: "PASSED" as const, completed: true },
		],
	])("a quien ya está %s no se le recalifica", async (_label, stored) => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 100, EARLIER, stored)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
			scores: [
				{ userId: 50, itemDocumentId: LESSON_1, score: 10 },
				{ userId: 50, itemDocumentId: MODULE_QUIZ_A, score: 10 },
			],
		});

		await sync.recalculate(courseOf(), 50, AT);

		expect(calls.results).toEqual([]);
	});

	test.each([
		["exige evaluación", { requiresEvaluation: true }],
		["no cuenta el contenido", { completionRule: "ATTENDANCE" as const }],
	])("no escribe resultado si el curso %s", async (_label, evaluation) => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 50, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
			scores: [{ userId: 50, itemDocumentId: MODULE_QUIZ_A, score: 80 }],
		});

		await sync.recalculate(
			courseOf("PUBLISHED", "SELF_PACED", evaluation),
			50,
			AT,
			[50],
		);

		expect(calls.results).toEqual([]);
	});

	test("sin evaluaciones en el temario no escribe resultado", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 0, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
		});

		await sync.recalculate(courseOf(), 50, AT, [50]);

		expect(calls.results).toEqual([]);
		expect(calls.syncs).toHaveLength(1);
	});

	// Un calendarizado con asistencia y contenido calcula el completado al cierre.
	test("un calendarizado publicado guarda el contenido pero no acredita todavía", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 0, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
		});

		await sync.recalculate(courseOf("PUBLISHED", "SCHEDULED"), 50, AT);

		expect(calls.writes).toEqual([
			[{ userId: 50, percent: 100, completedAt: AT }],
		]);
		expect(calls.syncs).toEqual([]);
	});

	// ADR-0014: añadir una obligatoria después no le quita el completado a nadie.
	test("una lección nueva baja el porcentaje sin borrar el completado", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1, LESSON_2, LESSON_3],
			states: [stateOf(50, 100, EARLIER)],
			completed: [
				{ userId: 50, lessonDocumentId: LESSON_1 },
				{ userId: 50, lessonDocumentId: LESSON_2 },
			],
		});

		const result = await sync.recalculate(courseOf(), 2, AT);

		expect(result).toEqual([
			{ userId: 50, percent: 66, contentCompleted: true },
		]);
		expect(calls.writes).toEqual([
			[{ userId: 50, percent: 66, completedAt: null }],
		]);
		expect(calls.syncs).toEqual([]);
	});

	// El criterio de aceptación: el caché coincide con el recálculo al archivar.
	test("archivar la obligatoria pendiente completa a quien ya tenía las demás", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 50, null), stateOf(51, 0, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
		});

		await sync.recalculate(courseOf(), 2, AT);

		expect(calls.writes).toEqual([
			[{ userId: 50, percent: 100, completedAt: AT }],
		]);
		expect(calls.syncs).toEqual([{ courseId: 7, actorId: 2, at: AT }]);
	});

	test("sin el examen final presentado no se califica", async () => {
		const { sync, calls } = createHarness({
			lessons: [],
			states: [stateOf(50, 0, null)],
			completed: [],
		});

		await sync.recalculate(
			courseOf("PUBLISHED", "SCHEDULED", {
				completionRule: "ATTENDANCE",
				requiresEvaluation: true,
			}),
			50,
			AT,
			[50],
		);

		expect(calls.results).toEqual([]);
	});

	// ADR-0024: el examen final se compensa con el temario si el promedio alcanza.
	test("el examen final entra al promedio con el temario", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [stateOf(50, 100, EARLIER)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
			moduleQuiz: true,
			scores: [
				{ userId: 50, itemDocumentId: LESSON_1, score: 100 },
				{ userId: 50, itemDocumentId: MODULE_QUIZ_A, score: 100 },
			],
			finals: [{ userId: 50, score: 0 }],
		});

		await sync.recalculate(
			courseOf("PUBLISHED", "SELF_PACED", { requiresEvaluation: true }),
			50,
			AT,
			[50],
		);

		expect(calls.results[0]?.entries).toEqual([
			{ userId: 50, result: "FAILED", grade: 66 },
		]);
	});

	// ADR-0027: un seguimiento que cuenta y cerró sin intento vale 0.
	test("un seguimiento que cuenta y ya cerró sin intento vale 0", async () => {
		const { sync, calls } = createHarness({
			lessons: [],
			states: [stateOf(50, 0, null)],
			completed: [],
			followUps: [followUpOf(), followUpOf({ id: 41 })],
			followUpScores: [followUpScoreOf(50, 100)],
		});

		await sync.recalculate(
			courseOf("PUBLISHED", "SCHEDULED", { completionRule: "ATTENDANCE" }),
			50,
			AT,
			[50],
		);

		expect(calls.results[0]?.entries).toEqual([
			{ userId: 50, result: "FAILED", grade: 50 },
		]);
	});

	test("un seguimiento todavía abierto sin intento no entra al promedio", async () => {
		const { sync, calls } = createHarness({
			lessons: [],
			states: [stateOf(50, 0, null)],
			completed: [],
			followUps: [
				followUpOf(),
				followUpOf({ id: 41, availability: "MANUAL", openedAt: EARLIER }),
			],
			followUpScores: [followUpScoreOf(50, 100)],
		});

		await sync.recalculate(
			courseOf("PUBLISHED", "SCHEDULED", { completionRule: "ATTENDANCE" }),
			50,
			AT,
			[50],
		);

		expect(calls.results[0]?.entries).toEqual([
			{ userId: 50, result: "PASSED", grade: 100 },
		]);
	});

	test("al cerrar la capacitación todo seguimiento cuenta como cerrado", async () => {
		const { sync, calls } = createHarness({
			lessons: [],
			states: [stateOf(50, 0, null)],
			completed: [],
			followUps: [
				followUpOf(),
				followUpOf({ id: 41, availability: "MANUAL", openedAt: EARLIER }),
			],
			followUpScores: [followUpScoreOf(50, 100)],
		});

		await sync.recalculate(
			courseOf("PUBLISHED", "SCHEDULED", { completionRule: "ATTENDANCE" }),
			2,
			AT,
			undefined,
			{ closing: true },
		);

		expect(calls.results[0]?.entries).toEqual([
			{ userId: 50, result: "FAILED", grade: 50 },
		]);
	});

	test("un seguimiento que no cuenta no califica la capacitación", async () => {
		const { sync, calls } = createHarness({
			lessons: [],
			states: [stateOf(50, 0, null)],
			completed: [],
			followUps: [followUpOf({ countsTowardGrade: false })],
			followUpScores: [followUpScoreOf(50, 20)],
		});

		await sync.recalculate(
			courseOf("PUBLISHED", "SCHEDULED", { completionRule: "ATTENDANCE" }),
			50,
			AT,
			[50],
			{ closing: true },
		);

		expect(calls.results).toEqual([]);
	});

	// En un calendarizado el resultado es provisional hasta el cierre.
	test("un aprobado sin crédito se recalcula con el seguimiento", async () => {
		const { sync, calls } = createHarness({
			lessons: [],
			states: [stateOf(50, 0, null, { result: "PASSED", grade: 100 })],
			completed: [],
			finals: [{ userId: 50, score: 100 }],
			followUps: [followUpOf()],
		});

		await sync.recalculate(
			courseOf("PUBLISHED", "SCHEDULED", {
				completionRule: "ATTENDANCE",
				requiresEvaluation: true,
			}),
			2,
			AT,
			undefined,
			{ closing: true },
		);

		expect(calls.results[0]?.entries).toEqual([
			{ userId: 50, result: "FAILED", grade: 50 },
		]);
	});

	test("si nada cambia no escribe", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1, LESSON_2],
			states: [stateOf(50, 50, null)],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
		});

		await sync.recalculate(courseOf(), 50, AT);

		expect(calls.writes).toEqual([]);
		expect(calls.syncs).toEqual([]);
	});
});
