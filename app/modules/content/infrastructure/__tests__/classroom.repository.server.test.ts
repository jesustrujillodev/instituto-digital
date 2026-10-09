import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { COURSE_DOC, LESSON_1 } from "../../domain/__tests__/content.fixtures";
import { createClassroomRepository } from "../classroom.repository.server";

const AT = new Date("2027-03-10T18:00:00.000Z");

/** Doble de Prisma que registra cada consulta, sin tocar la base. */
const createHarness = (course: unknown = null) => {
	const calls: Record<string, Record<string, unknown>[]> = {
		courseFindUnique: [],
		progressFindMany: [],
		progressUpsert: [],
	};

	const repository = createClassroomRepository({
		prisma: {
			course: {
				findUnique: async (args: Record<string, unknown>) => {
					calls.courseFindUnique.push(args);
					return course;
				},
			},
			lessonProgress: {
				findMany: async (args: Record<string, unknown>) => {
					calls.progressFindMany.push(args);
					return [{ userId: 50, lesson: { documentId: LESSON_1 } }];
				},
				upsert: async (args: Record<string, unknown>) => {
					calls.progressUpsert.push(args);
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("classroomRepository", () => {
	test("aplana la inscripción de quien abre el aula", async () => {
		const { repository } = createHarness({
			id: 7,
			documentId: COURSE_DOC,
			title: "Transparencia",
			status: "PUBLISHED",
			format: "SELF_PACED",
			completionRule: "CONTENT",
			enrollments: [
				{
					status: "ENROLLED",
					progressPercent: 50,
					contentCompletedAt: null,
					completed: false,
				},
			],
		});

		expect(await repository.findCourse(COURSE_DOC, 50)).toMatchObject({
			id: 7,
			enrollment: { status: "ENROLLED", progressPercent: 50 },
		});
	});

	test("sin inscripción la deja en null", async () => {
		const { repository } = createHarness({
			id: 7,
			documentId: COURSE_DOC,
			title: "Transparencia",
			status: "PUBLISHED",
			format: "SELF_PACED",
			completionRule: "CONTENT",
			enrollments: [],
		});

		expect(await repository.findCourse(COURSE_DOC, 50)).toMatchObject({
			enrollment: null,
		});
	});

	// Una lección archivada, o de un módulo archivado, deja de contar.
	test("el avance solo mira lecciones activas del curso", async () => {
		const { repository, calls } = createHarness();

		await repository.findCompletedLessons(7, [50]);

		expect(calls.progressFindMany[0]).toMatchObject({
			where: {
				status: "COMPLETED",
				userId: { in: [50] },
				lesson: { archivedAt: null, module: { courseId: 7, archivedAt: null } },
			},
		});
	});

	test("completar fija la fecha; empezar la deja vacía", async () => {
		const { repository, calls } = createHarness();

		await repository.saveProgress(31, 50, "COMPLETED", AT);
		await repository.saveProgress(32, 50, "IN_PROGRESS", AT);

		expect(calls.progressUpsert).toEqual([
			{
				where: { lessonId_userId: { lessonId: 31, userId: 50 } },
				create: {
					lessonId: 31,
					userId: 50,
					status: "COMPLETED",
					startedAt: AT,
					completedAt: AT,
				},
				update: { status: "COMPLETED", completedAt: AT },
			},
			{
				where: { lessonId_userId: { lessonId: 32, userId: 50 } },
				create: {
					lessonId: 32,
					userId: 50,
					status: "IN_PROGRESS",
					startedAt: AT,
					completedAt: null,
				},
				update: { status: "IN_PROGRESS", completedAt: null },
			},
		]);
	});
});

describe("classroomRepository.findCompletedLessonsIn", () => {
	test("lee los cursos juntos y reparte las filas por curso", async () => {
		const calls: unknown[] = [];
		const repository = createClassroomRepository({
			prisma: {
				lessonProgress: {
					findMany: async (args: unknown) => {
						calls.push(args);
						return [
							{
								userId: 50,
								lesson: { documentId: LESSON_1, module: { courseId: 8 } },
							},
						];
					},
				},
			} as unknown as ICradle["prisma"],
		});

		const byCourse = await repository.findCompletedLessonsIn([7, 8], [50]);

		expect(calls).toEqual([
			expect.objectContaining({
				where: {
					status: "COMPLETED",
					lesson: {
						archivedAt: null,
						module: { courseId: { in: [7, 8] }, archivedAt: null },
					},
					userId: { in: [50] },
				},
			}),
		]);
		expect(byCourse).toEqual(
			new Map([
				[7, []],
				[8, [{ userId: 50, lessonDocumentId: LESSON_1 }]],
			]),
		);
	});

	test("sin cursos no consulta", async () => {
		const repository = createClassroomRepository({
			prisma: {} as unknown as ICradle["prisma"],
		});

		expect(await repository.findCompletedLessonsIn([], [50])).toEqual(
			new Map(),
		);
	});
});

describe("classroomRepository.findLessonStatus", () => {
	test("la busca con el mismo filtro de lección activa que findProgress", async () => {
		const calls: unknown[] = [];
		const repository = createClassroomRepository({
			prisma: {
				lessonProgress: {
					findFirst: async (args: unknown) => {
						calls.push(args);
						return { status: "COMPLETED" };
					},
				},
			} as unknown as ICradle["prisma"],
		});

		expect(await repository.findLessonStatus(7, 31, 50)).toBe("COMPLETED");
		expect(calls).toEqual([
			{
				where: {
					userId: 50,
					lessonId: 31,
					lesson: {
						archivedAt: null,
						module: { courseId: 7, archivedAt: null },
					},
				},
				select: { status: true },
			},
		]);
	});

	test("sin fila responde null", async () => {
		const repository = createClassroomRepository({
			prisma: {
				lessonProgress: { findFirst: async () => null },
			} as unknown as ICradle["prisma"],
		});

		expect(await repository.findLessonStatus(7, 31, 50)).toBeNull();
	});
});
