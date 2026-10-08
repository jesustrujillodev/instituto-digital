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
		attendanceWrites: [],
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
				createMany: async (args: Record<string, unknown>) => {
					calls.attendanceWrites.push({ createMany: args });
				},
				updateMany: async (args: Record<string, unknown>) => {
					calls.attendanceWrites.push({ updateMany: args });
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
	const at = new Date("2026-09-03T17:00:00.000Z");
	const dataOf = (attended: boolean) => ({
		attended,
		source: "MANUAL",
		recordedById: 9,
		recordedAt: at,
	});

	test("por cada valor, crea las que faltan y escribe todas, con quién y cuándo", async () => {
		const { repository, calls } = createHarness();

		await repository.saveAttendance(
			101,
			[
				{ userId: 50, attended: true },
				{ userId: 51, attended: false },
				{ userId: 52, attended: true },
			],
			9,
			at,
		);

		expect(calls.upsert).toEqual([]);
		expect(calls.attendanceWrites).toEqual([
			{
				createMany: {
					data: [
						{ sessionId: 101, userId: 50, ...dataOf(true) },
						{ sessionId: 101, userId: 52, ...dataOf(true) },
					],
					skipDuplicates: true,
				},
			},
			{
				updateMany: {
					where: { sessionId: 101, userId: { in: [50, 52] } },
					data: dataOf(true),
				},
			},
			{
				createMany: {
					data: [{ sessionId: 101, userId: 51, ...dataOf(false) }],
					skipDuplicates: true,
				},
			},
			{
				updateMany: {
					where: { sessionId: 101, userId: { in: [51] } },
					data: dataOf(false),
				},
			},
		]);
	});

	test("si una persona viene dos veces gana la última marca, como en fila", async () => {
		const { repository, calls } = createHarness();

		await repository.saveAttendance(
			101,
			[
				{ userId: 50, attended: true },
				{ userId: 50, attended: false },
			],
			9,
			at,
		);

		expect(calls.attendanceWrites).toEqual([
			{
				createMany: {
					data: [{ sessionId: 101, userId: 50, ...dataOf(false) }],
					skipDuplicates: true,
				},
			},
			{
				updateMany: {
					where: { sessionId: 101, userId: { in: [50] } },
					data: dataOf(false),
				},
			},
		]);
	});

	test("sin marcas no escribe nada", async () => {
		const { repository, calls } = createHarness();

		await repository.saveAttendance(101, [], 9, at);

		expect(calls.attendanceWrites).toEqual([]);
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

describe("findAwaitingFinish", () => {
	const NOW = new Date("2026-09-16T18:00:00.000Z");

	test("calendarizados publicados con todas sus sesiones ya terminadas", async () => {
		const { repository, calls } = createHarness();

		await repository.findAwaitingFinish(WHERE, {
			now: NOW,
			viewerId: 9,
			take: 50,
		});

		expect(calls.findMany[0]).toMatchObject({
			where: {
				AND: [
					WHERE,
					{
						status: "PUBLISHED",
						format: "SCHEDULED",
						sessions: { some: {}, none: { endsAt: { gt: NOW } } },
					},
				],
			},
			take: 50,
			select: {
				sessions: { orderBy: { endsAt: "desc" }, take: 1 },
				trainers: { where: { userId: 9 } },
				_count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
			},
		});
	});

	test("proyecta la última sesión, los inscritos y si quien consulta imparte", async () => {
		const repository = createTeachingRepository({
			prisma: {
				course: {
					findMany: async () => [
						{
							documentId: "c",
							title: "Archivo",
							dependencyId: 3,
							sessions: [{ endsAt: new Date("2026-09-03T20:00:00.000Z") }],
							trainers: [{ userId: 9 }],
							_count: { enrollments: 14 },
						},
					],
				},
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => key,
		});

		const [record] = await repository.findAwaitingFinish(WHERE, {
			now: NOW,
			viewerId: 9,
			take: 50,
		});

		expect(record).toEqual({
			documentId: "c",
			title: "Archivo",
			dependencyId: 3,
			lastSessionEndsAt: new Date("2026-09-03T20:00:00.000Z"),
			enrolledCount: 14,
			viewerTeaches: true,
		});
	});
});

describe("findCourseId", () => {
	test("usa el mismo filtro que findCourse y solo pide el id", async () => {
		const { repository, calls } = createHarness();

		await repository.findCourse("c-doc", WHERE);
		await repository.findCourseId("c-doc", WHERE);

		expect(calls.findFirst[1]?.where).toEqual(calls.findFirst[0]?.where);
		expect(calls.findFirst[1]?.select).toEqual({ id: true });
	});
});
