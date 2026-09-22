import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import {
	COURSE_DOC,
	LESSON_1,
	LESSON_2,
	MODULE_A,
	MODULE_B,
} from "../../domain/__tests__/content.fixtures";
import { createContentRepository } from "../content.repository.server";

const WHERE = { dependencyId: 3, createdById: 9 };
const AT = new Date("2026-09-21T18:00:00.000Z");

/** Doble de Prisma que registra cada consulta, sin tocar la base. */
const createHarness = () => {
	const calls: Record<string, Record<string, unknown>[]> = {
		courseFindFirst: [],
		moduleFindMany: [],
		moduleFindFirst: [],
		moduleUpdate: [],
		moduleCreate: [],
		lessonFindMany: [],
		lessonFindFirst: [],
		lessonUpdate: [],
		lessonCreate: [],
		lessonCount: [],
	};

	const record =
		(key: string, value: unknown = null) =>
		async (args: Record<string, unknown>) => {
			calls[key].push(args);
			return value;
		};

	const repository = createContentRepository({
		prisma: {
			course: { findFirst: record("courseFindFirst") },
			courseModule: {
				findMany: record("moduleFindMany", []),
				findFirst: record("moduleFindFirst"),
				create: record("moduleCreate"),
				update: record("moduleUpdate"),
			},
			lesson: {
				findMany: record("lessonFindMany", []),
				findFirst: record("lessonFindFirst"),
				create: record("lessonCreate"),
				update: record("lessonUpdate"),
				count: record("lessonCount", 0),
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("findCourse", () => {
	test("aplica el filtro del alcance junto al documentId", async () => {
		const { repository, calls } = createHarness();

		expect(await repository.findCourse(COURSE_DOC, WHERE)).toBeNull();
		expect(calls.courseFindFirst[0]).toMatchObject({
			where: { AND: [{ documentId: COURSE_DOC }, WHERE] },
		});
	});
});

describe("lecturas del temario", () => {
	test("el árbol deja fuera lo archivado en los dos niveles", async () => {
		const { repository, calls } = createHarness();

		await repository.findTree(7);

		const args = calls.moduleFindMany[0] as {
			where: Record<string, unknown>;
			orderBy: unknown;
			select: { lessons: { where: unknown; orderBy: unknown } };
		};

		expect(args.where).toEqual({ courseId: 7, archivedAt: null });
		expect(args.orderBy).toEqual({ order: "asc" });
		expect(args.select.lessons.where).toEqual({ archivedAt: null });
		expect(args.select.lessons.orderBy).toEqual({ order: "asc" });
	});

	test("el conteo de lecciones exige módulo activo", async () => {
		const { repository, calls } = createHarness();

		await repository.countActiveLessons(7);

		expect(calls.lessonCount[0]).toEqual({
			where: { archivedAt: null, module: { courseId: 7, archivedAt: null } },
		});
	});

	test("una lección se busca por su curso, no por su módulo", async () => {
		const { repository, calls } = createHarness();

		await repository.findLesson(7, LESSON_1);

		expect(calls.lessonFindFirst[0]).toMatchObject({
			where: {
				documentId: LESSON_1,
				archivedAt: null,
				module: { courseId: 7, archivedAt: null },
			},
		});
	});
});

describe("escrituras de orden", () => {
	test("archivar escribe la fecha y luego el re-empaque", async () => {
		const { repository, calls } = createHarness();

		await repository.archiveModule(21, AT, [
			{ documentId: MODULE_B, order: 1 },
		]);

		expect(calls.moduleUpdate).toEqual([
			{ where: { id: 21 }, data: { archivedAt: AT } },
			{ where: { documentId: MODULE_B }, data: { order: 1 } },
		]);
	});

	test("sin filas que mover, archivar no escribe orden ninguno", async () => {
		const { repository, calls } = createHarness();

		await repository.archiveLesson(31, AT, []);

		expect(calls.lessonUpdate).toEqual([
			{ where: { id: 31 }, data: { archivedAt: AT } },
		]);
	});

	test("el reordenamiento escribe una fila por posición y reconecta el módulo", async () => {
		const { repository, calls } = createHarness();

		await repository.saveOrder({
			modules: [{ documentId: MODULE_A, order: 2 }],
			lessons: [{ documentId: LESSON_2, moduleDocumentId: MODULE_B, order: 1 }],
		});

		expect(calls.moduleUpdate).toEqual([
			{ where: { documentId: MODULE_A }, data: { order: 2 } },
		]);
		expect(calls.lessonUpdate).toEqual([
			{
				where: { documentId: LESSON_2 },
				data: {
					order: 1,
					module: { connect: { documentId: MODULE_B } },
				},
			},
		]);
	});
});
