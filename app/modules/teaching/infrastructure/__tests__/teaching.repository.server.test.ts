import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createTeachingRepository } from "../teaching.repository.server";

const WHERE = { OR: [{ trainers: { some: { userId: 9 } } }] };

/**
 * Doble de Prisma que registra cada consulta. Quién imparte qué lo prueban
 * `teaching.access` y el servicio; aquí se comprueba que el repositorio lo
 * aplique en el `where` y no lea borradores ni cancelados.
 */
const createHarness = () => {
	const calls: Record<string, Record<string, unknown>[]> = {
		findFirst: [],
		findMany: [],
		upsert: [],
	};

	const repository = createTeachingRepository({
		prisma: {
			course: {
				findFirst: async (args: Record<string, unknown>) => {
					calls.findFirst.push(args);
					return null;
				},
				findMany: async (args: Record<string, unknown>) => {
					calls.findMany.push(args);
					return [];
				},
			},
			courseAttendance: {
				upsert: async (args: Record<string, unknown>) => {
					calls.upsert.push(args);
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("findCourse", () => {
	test("funde el filtro del alcance con los estados que se imparten", async () => {
		const { repository, calls } = createHarness();

		const course = await repository.findCourse("c-doc", WHERE);

		expect(course).toBeNull();
		expect(calls.findFirst[0]).toMatchObject({
			where: {
				AND: [
					{ documentId: "c-doc", status: { in: ["PUBLISHED", "FINISHED"] } },
					WHERE,
				],
			},
		});
	});

	test("solo lee a los inscritos y su asistencia en las sesiones del curso", async () => {
		const { repository, calls } = createHarness();

		await repository.findCourse("c-doc", WHERE);

		expect(calls.findFirst[0]).toMatchObject({
			select: {
				enrollments: {
					where: { status: "ENROLLED" },
					select: {
						user: {
							select: {
								attendance: {
									where: { session: { course: { documentId: "c-doc" } } },
								},
							},
						},
					},
				},
			},
		});
	});
});

describe("findCourses", () => {
	test("un filtro de estado no puede abrir borradores", async () => {
		const { repository, calls } = createHarness();

		await repository.findCourses(
			{ status: "FINISHED", page: 2, pageSize: 5 },
			WHERE,
		);

		expect(calls.findMany[0]).toMatchObject({
			where: { AND: [WHERE, { status: { in: ["FINISHED"] } }] },
			skip: 5,
			take: 5,
		});
	});
});

describe("saveAttendance", () => {
	test("escribe una marca por persona con quién y cuándo", async () => {
		const { repository, calls } = createHarness();
		const at = new Date("2026-09-03T17:00:00.000Z");

		await repository.saveAttendance(
			101,
			[
				{ userId: 50, attended: true },
				{ userId: 51, attended: false },
			],
			9,
			at,
		);

		expect(calls.upsert).toHaveLength(2);
		expect(calls.upsert[1]).toEqual({
			where: { sessionId_userId: { sessionId: 101, userId: 51 } },
			create: {
				sessionId: 101,
				userId: 51,
				attended: false,
				recordedById: 9,
				recordedAt: at,
			},
			update: { attended: false, recordedById: 9, recordedAt: at },
		});
	});
});
