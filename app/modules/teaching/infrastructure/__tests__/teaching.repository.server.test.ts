import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createTeachingRepository } from "../teaching.repository.server";

const WHERE = { OR: [{ trainers: { some: { userId: 9 } } }] };

/**
 * Doble de Prisma que registra cada consulta. Quién imparte qué lo prueban
 * `teaching.access` y el servicio; aquí se comprueba que el repositorio lo
 * aplique en el `where` y no lea borradores ni cancelados.
 */
const createHarness = (
	stored: { attended: boolean; source: "MANUAL" | "QR" } | null = null,
) => {
	const calls: Record<string, Record<string, unknown>[]> = {
		findFirst: [],
		findMany: [],
		findUnique: [],
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
				findUnique: async (args: Record<string, unknown>) => {
					calls.findUnique.push(args);
					return stored;
				},
				upsert: async (args: Record<string, unknown>) => {
					calls.upsert.push(args);
				},
			},
		} as unknown as ICradle["prisma"],
		assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
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

	test("sin orden pedido, los publicados van primero", async () => {
		const { repository, calls } = createHarness();

		await repository.findCourses({}, WHERE);

		expect(calls.findMany[0].orderBy).toEqual([
			{ status: "desc" },
			{ updatedAt: "desc" },
		]);
	});

	test("el orden pedido manda y la última modificación desempata", async () => {
		const { repository, calls } = createHarness();

		await repository.findCourses({ sortBy: "title", sortDir: "asc" }, WHERE);
		await repository.findCourses(
			{ sortBy: "updatedAt", sortDir: "desc" },
			WHERE,
		);

		expect(calls.findMany[0].orderBy).toEqual([
			{ title: "asc" },
			{ updatedAt: "desc" },
		]);
		expect(calls.findMany[1].orderBy).toEqual([{ updatedAt: "desc" }]);
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
				source: "MANUAL",
				recordedById: 9,
				recordedAt: at,
			},
			update: {
				attended: false,
				source: "MANUAL",
				recordedById: 9,
				recordedAt: at,
			},
		});
	});
});

describe("checkIn", () => {
	const at = new Date("2026-09-01T17:00:00.000Z");

	test("marca presente a la propia persona y deja constancia del QR", async () => {
		const { repository, calls } = createHarness();

		const written = await repository.checkIn(101, 50, at);

		expect(written).toBe(true);
		expect(calls.upsert[0]).toEqual({
			where: { sessionId_userId: { sessionId: 101, userId: 50 } },
			create: {
				sessionId: 101,
				userId: 50,
				attended: true,
				source: "QR",
				recordedById: 50,
				recordedAt: at,
			},
			update: {
				attended: true,
				source: "QR",
				recordedById: 50,
				recordedAt: at,
			},
		});
	});

	test("sobreescribe una ausencia puesta a mano: quien llega tarde se registra", async () => {
		const { repository, calls } = createHarness({
			attended: false,
			source: "MANUAL",
		});

		const written = await repository.checkIn(101, 50, at);

		expect(written).toBe(true);
		expect(calls.upsert).toHaveLength(1);
	});

	test("sobreescribe una presencia puesta a mano, para que el QR quede auditado", async () => {
		const { repository, calls } = createHarness({
			attended: true,
			source: "MANUAL",
		});

		expect(await repository.checkIn(101, 50, at)).toBe(true);
		expect(calls.upsert).toHaveLength(1);
	});

	test("un segundo escaneo no reescribe: conserva el instante del primero", async () => {
		const { repository, calls } = createHarness({
			attended: true,
			source: "QR",
		});

		const written = await repository.checkIn(101, 50, at);

		expect(written).toBe(false);
		expect(calls.upsert).toHaveLength(0);
	});
});
