import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { catalogAccessWhere } from "../../domain/enrollment.access";
import type { CatalogFilter } from "../../domain/enrollment.repository";
import { createEnrollmentRepository } from "../enrollments.repository.server";

const AT = new Date("2026-09-03T17:00:00.000Z");

const createHarness = () => {
	const calls: Record<string, unknown>[] = [];

	const repository = createEnrollmentRepository({
		prisma: {
			enrollment: {
				updateMany: async (args: Record<string, unknown>) => {
					calls.push(args);
					return { count: 1 };
				},
			},
		} as unknown as ICradle["prisma"],
		assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
	});

	return { repository, calls };
};

describe("saveResults", () => {
	test("escribe resultado y nota solo en inscritos, con quién y cuándo", async () => {
		const { repository, calls } = createHarness();

		await repository.saveResults(
			10,
			[{ userId: 50, result: "PASSED", grade: 92 }],
			9,
			AT,
		);

		expect(calls).toEqual([
			{
				where: { courseId: 10, userId: 50, status: "ENROLLED" },
				data: {
					result: "PASSED",
					grade: 92,
					resultRecordedById: 9,
					resultRecordedAt: AT,
				},
			},
		]);
	});
});

describe("setCompletion", () => {
	test("marca a quien completó y desmarca al resto de inscritos", async () => {
		const { repository, calls } = createHarness();

		await repository.setCompletion(10, [50]);

		expect(calls).toEqual([
			{
				where: { courseId: 10, status: "ENROLLED", userId: { in: [50] } },
				data: { completed: true },
			},
			{
				where: { courseId: 10, status: "ENROLLED", userId: { notIn: [50] } },
				data: { completed: false },
			},
		]);
	});
});

describe("catálogo", () => {
	const NOW = new Date("2026-09-22T17:00:00.000Z");
	const CATALOG_FILTER = {
		AND: [{ OR: [] }, catalogAccessWhere(50)],
	} as unknown as CatalogFilter;

	// Quien administra o imparte un curso por invitación lo ve, pero el
	// catálogo no se lo ofrece si no está invitado (docs/adr/0004). La regla
	// viaja en el filtro; lo que no puede pasar es que una consulta lo suelte.
	test("las tres consultas aplican el filtro del catálogo completo", async () => {
		const wheres: unknown[] = [];
		const record = async (args: { where: unknown }) => {
			wheres.push(args.where);
			return [];
		};
		const repository = createEnrollmentRepository({
			prisma: {
				course: {
					findMany: record,
					count: async (args: { where: unknown }) => {
						wheres.push(args.where);
						return 0;
					},
				},
				enrollment: { findMany: async () => [] },
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
		});
		const params = { filters: {}, filter: CATALOG_FILTER, now: NOW };

		await repository.findAvailable({ ...params, userId: 50 });
		await repository.countAvailable(params);
		await repository.findAvailableOrganizers(params);

		expect(wheres).toHaveLength(3);
		for (const where of wheres) {
			expect((where as { AND: unknown[] }).AND).toContainEqual(CATALOG_FILTER);
		}
	});
});

describe("markPendingAsFailed", () => {
	// «No presentó»: al cerrar un curso evaluado por examen (docs/adr/0015).
	test("solo toca a los inscritos que siguen pendientes, y les quita la nota", async () => {
		const { repository, calls } = createHarness();

		await repository.markPendingAsFailed(7, 2, AT);

		expect(calls).toEqual([
			{
				where: { courseId: 7, status: "ENROLLED", result: "PENDING" },
				data: {
					result: "FAILED",
					grade: null,
					resultRecordedById: 2,
					resultRecordedAt: AT,
				},
			},
		]);
	});
});

describe("countInvited", () => {
	const countWith = async (dependencyId: number | null) => {
		const queries: unknown[] = [];
		const repository = createEnrollmentRepository({
			prisma: {
				enrollment: {
					count: async (args: unknown) => {
						queries.push(args);
						return 4;
					},
				},
			} as unknown as ICradle["prisma"],
			assetUrlResolver: (key: string) => `/api/storage?key=${key}`,
		});

		return { total: await repository.countInvited(7, dependencyId), queries };
	};

	test("cuenta las invitaciones sin responder del curso", async () => {
		const { total, queries } = await countWith(null);

		expect(total).toBe(4);
		expect(queries).toEqual([{ where: { courseId: 7, status: "INVITED" } }]);
	});

	test("con dependencia, solo las de su personal", async () => {
		const { queries } = await countWith(3);

		expect(queries).toEqual([
			{ where: { courseId: 7, status: "INVITED", dependencyId: 3 } },
		]);
	});
});
