import { describe, expect, test } from "vitest";
import type {
	CourseFormat,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type {
	ProgressWrite,
	ProgressState as StoredProgress,
} from "@/modules/enrollments/domain/enrollment.types";
import type { ICradle } from "@/shared/di/container.types";
import {
	LESSON_1,
	LESSON_2,
	LESSON_3,
	MODULE_A,
} from "../../domain/__tests__/content.fixtures";
import type { CompletedLessonRow } from "../../domain/classroom.types";
import type { ContentModuleRaw } from "../../domain/content.mapper";
import { createProgressSync } from "../progress-sync.server";

const AT = new Date("2027-03-10T18:00:00.000Z");
const EARLIER = new Date("2027-01-05T18:00:00.000Z");

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

const treeOf = (lessons: string[]): ContentModuleRaw[] => [
	{
		documentId: MODULE_A,
		title: "Fundamentos",
		description: null,
		order: 1,
		lessons: lessons.map((documentId, index) =>
			lessonRaw(documentId, index + 1),
		),
	},
];

const createHarness = (options: {
	lessons: string[];
	states: StoredProgress[];
	completed: CompletedLessonRow[];
}) => {
	const calls = {
		locks: 0,
		writes: [] as ProgressWrite[][],
		syncs: [] as { courseId: number; actorId: number; at: Date }[],
	};

	const sync = createProgressSync({
		contentRepository: {
			findTree: async () => treeOf(options.lessons),
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
		enrollmentRepository: {
			lockCourseSeats: async () => {
				calls.locks += 1;
				return { capacity: null, enrolled: 0 };
			},
			findProgressStates: async () => options.states,
			saveProgress: async (_courseId: number, writes: ProgressWrite[]) => {
				calls.writes.push(writes);
			},
		} as unknown as ICradle["enrollmentRepository"],
		completionSync: {
			sync: async (courseId: number, actorId: number, at: Date) => {
				calls.syncs.push({ courseId, actorId, at });
				return { completed: 0, diff: { grant: [], restore: [], revoke: [] } };
			},
		} as unknown as ICradle["completionSync"],
	});

	return { sync, calls };
};

const courseOf = (
	status: CourseStatus = "PUBLISHED",
	format: CourseFormat = "SELF_PACED",
) => ({ id: 7, status, format });

describe("progressSync.recalculate", () => {
	test("quien termina las obligatorias fija su fecha y un autogestivo lo acredita", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1, LESSON_2],
			states: [{ userId: 50, progressPercent: 50, contentCompletedAt: null }],
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

	// Un calendarizado con asistencia y contenido calcula el completado al cierre.
	test("un calendarizado publicado guarda el contenido pero no acredita todavía", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1],
			states: [{ userId: 50, progressPercent: 0, contentCompletedAt: null }],
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
			states: [
				{ userId: 50, progressPercent: 100, contentCompletedAt: EARLIER },
			],
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
			states: [
				{ userId: 50, progressPercent: 50, contentCompletedAt: null },
				{ userId: 51, progressPercent: 0, contentCompletedAt: null },
			],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
		});

		await sync.recalculate(courseOf(), 2, AT);

		expect(calls.writes).toEqual([
			[{ userId: 50, percent: 100, completedAt: AT }],
		]);
		expect(calls.syncs).toEqual([{ courseId: 7, actorId: 2, at: AT }]);
	});

	test("si nada cambia no escribe", async () => {
		const { sync, calls } = createHarness({
			lessons: [LESSON_1, LESSON_2],
			states: [{ userId: 50, progressPercent: 50, contentCompletedAt: null }],
			completed: [{ userId: 50, lessonDocumentId: LESSON_1 }],
		});

		await sync.recalculate(courseOf(), 50, AT);

		expect(calls.writes).toEqual([]);
		expect(calls.syncs).toEqual([]);
	});
});
