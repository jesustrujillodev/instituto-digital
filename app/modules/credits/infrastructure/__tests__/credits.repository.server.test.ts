import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createCreditRepository } from "../credits.repository.server";

const AT = new Date("2026-09-03T17:00:00.000Z");
const CONTEXT = { courseId: 10, fiscalYear: 2026, at: AT, actorId: 9 };

const MINE_ROW = {
	documentId: "k",
	fiscalYear: 2026,
	grantedAt: AT,
	dependency: { name: "Obras Públicas" },
	course: {
		id: 10,
		documentId: "c",
		title: "Liderazgo",
		modality: "IN_PERSON",
		coverImageUrl: null,
		dependency: { name: "Oficialía Mayor" },
		sessions: [
			{
				startsAt: new Date("2026-09-01T16:00:00.000Z"),
				endsAt: new Date("2026-09-01T18:00:00.000Z"),
			},
		],
		enrollments: [{ grade: 88 }],
	},
};

const createHarness = (groups: unknown[] = []) => {
	const calls: Record<string, Record<string, unknown>[]> = {
		createMany: [],
		updateMany: [],
		userFindMany: [],
		dependencyFindMany: [],
		creditFindMany: [],
		attendanceFindMany: [],
	};

	const repository = createCreditRepository({
		prisma: {
			credit: {
				createMany: async (args: Record<string, unknown>) => {
					calls.createMany.push(args);
				},
				updateMany: async (args: Record<string, unknown>) => {
					calls.updateMany.push(args);
				},
				groupBy: async () => groups,
				findMany: async (args: Record<string, unknown>) => {
					calls.creditFindMany.push(args);
					return [MINE_ROW];
				},
			},
			courseAttendance: {
				findMany: async (args: Record<string, unknown>) => {
					calls.attendanceFindMany.push(args);
					return [{ session: { courseId: 10 } }, { session: { courseId: 10 } }];
				},
			},
			user: {
				findMany: async (args: Record<string, unknown>) => {
					calls.userFindMany.push(args);
					return [
						{
							documentId: "u",
							firstName: "Diana",
							lastName: null,
							email: "diana@instituto.gob.mx",
							dependencyId: 4,
							dependency: { name: "Desarrollo Social" },
							_count: { credits: 2 },
						},
					];
				},
			},
			dependency: {
				findMany: async (args: Record<string, unknown>) => {
					calls.dependencyFindMany.push(args);
					return [
						{ id: 3, documentId: "d3", name: "Obras Públicas" },
						{ id: 4, documentId: "d4", name: "Desarrollo Social" },
					];
				},
			},
		} as unknown as ICradle["prisma"],
		assetUrlResolver: (key: string) => `https://cdn.test/${key}`,
	});

	return { repository, calls };
};

describe("escrituras", () => {
	test("sin personas no llega a la base", async () => {
		const { repository, calls } = createHarness();

		await repository.grant([], CONTEXT);
		await repository.restore([], CONTEXT);
		await repository.revoke([], CONTEXT);

		expect(calls.createMany).toEqual([]);
		expect(calls.updateMany).toEqual([]);
	});

	test("otorgar guarda la dependencia de cada persona y el ejercicio", async () => {
		const { repository, calls } = createHarness();

		await repository.grant([{ userId: 50, dependencyId: 3 }], CONTEXT);

		expect(calls.createMany[0]).toEqual({
			data: [
				{
					userId: 50,
					dependencyId: 3,
					courseId: 10,
					fiscalYear: 2026,
					grantedAt: AT,
					grantedById: 9,
				},
			],
		});
	});

	test("retirar marca la fila vigente y nunca borra", async () => {
		const { repository, calls } = createHarness();

		await repository.revoke([50], CONTEXT);

		expect(calls.updateMany[0]).toEqual({
			where: { courseId: 10, userId: { in: [50] }, revokedAt: null },
			data: { revokedAt: AT, revokedById: 9 },
		});
	});

	test("restaurar no toca la dependencia con la que se obtuvo", async () => {
		const { repository, calls } = createHarness();

		await repository.restore([50], CONTEXT);

		expect(calls.updateMany[0].data).not.toHaveProperty("dependencyId");
		expect(calls.updateMany[0].data).toMatchObject({
			revokedAt: null,
			revokedById: null,
		});
	});
});

describe("findMine", () => {
	test("solo vigentes, con la asistencia propia contada por curso", async () => {
		const { repository, calls } = createHarness();

		const [credit] = await repository.findMine(50);

		expect(calls.creditFindMany[0]).toMatchObject({
			where: { userId: 50, revokedAt: null },
		});
		expect(calls.attendanceFindMany[0]).toMatchObject({
			where: {
				userId: 50,
				attended: true,
				session: { courseId: { in: [10] } },
			},
		});
		expect(credit).toMatchObject({
			dependencyName: "Obras Públicas",
			attendedSessions: 2,
			grade: 88,
			course: { dependencyName: "Oficialía Mayor", totalMinutes: 120 },
		});
	});
});

describe("findStaff", () => {
	test("incluye a quien obtuvo créditos aquí y ya se fue, y lo marca", async () => {
		const { repository, calls } = createHarness();

		const rows = await repository.findStaff({
			dependencyId: 3,
			fiscalYear: 2026,
			page: 1,
			pageSize: 20,
		});

		expect(calls.userFindMany[0]).toMatchObject({
			where: {
				AND: [
					{
						OR: [
							{ dependencyId: 3, type: "INTERNAL", archivedAt: null },
							{
								credits: {
									some: { dependencyId: 3, fiscalYear: 2026, revokedAt: null },
								},
							},
						],
					},
				],
			},
		});
		expect(rows[0]).toMatchObject({ transferred: true, credits: 2 });
	});
});

describe("summarizeByDependency", () => {
	test("suma créditos y personas por dependencia, con ceros", async () => {
		const { repository } = createHarness([
			{ dependencyId: 3, userId: 50, _count: { _all: 2 } },
			{ dependencyId: 3, userId: 51, _count: { _all: 1 } },
		]);

		const rows = await repository.summarizeByDependency(2026);

		expect(rows).toEqual([
			{
				dependencyDocumentId: "d3",
				name: "Obras Públicas",
				credits: 3,
				people: 2,
			},
			{
				dependencyDocumentId: "d4",
				name: "Desarrollo Social",
				credits: 0,
				people: 0,
			},
		]);
	});
});
