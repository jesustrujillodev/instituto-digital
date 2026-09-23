import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
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
	const INVITATION_BRANCH = {
		OR: [
			{ access: { not: "INVITATION" } },
			{ enrollments: { some: { userId: 50, status: "INVITED" } } },
		],
	};

	// Quien administra o imparte un curso por invitación lo ve, pero el
	// catálogo no se lo ofrece si no está invitado (docs/adr/0004).
	test("un curso por invitación solo sale con una invitación pendiente", async () => {
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
		const params = { filters: {}, filter: { OR: [] }, now: NOW, userId: 50 };

		await repository.findAvailable(params);
		await repository.countAvailable(params);
		await repository.findAvailableOrganizers(params);

		expect(wheres).toHaveLength(3);
		for (const where of wheres) {
			expect((where as { AND: unknown[] }).AND).toContainEqual(
				INVITATION_BRANCH,
			);
		}
	});
});
