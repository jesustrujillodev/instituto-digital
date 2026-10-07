import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createCourseAttentionRepository } from "../course-attention.repository.server";

const createHarness = () => {
	const calls: Record<string, unknown>[] = [];

	const repository = createCourseAttentionRepository({
		prisma: {
			course: {
				findMany: async (args: Record<string, unknown>) => {
					calls.push(args);
					return [
						{
							documentId: "c",
							title: "Archivo",
							updatedAt: new Date("2026-09-10T18:00:00.000Z"),
							sessions: [{ startsAt: new Date("2026-10-01T16:00:00.000Z") }],
						},
					];
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("findDrafts", () => {
	test("borradores del alcance, del último editado al más viejo", async () => {
		const { repository, calls } = createHarness();

		const rows = await repository.findDrafts({ dependencyId: 3 }, 6);

		expect(calls[0]).toMatchObject({
			where: { AND: [{ dependencyId: 3 }, { status: "DRAFT" }] },
			orderBy: { updatedAt: "desc" },
			take: 6,
		});
		expect(rows).toEqual([
			{
				documentId: "c",
				title: "Archivo",
				updatedAt: new Date("2026-09-10T18:00:00.000Z"),
				firstSessionAt: new Date("2026-10-01T16:00:00.000Z"),
			},
		]);
	});
});

describe("findWithoutActiveTrainer", () => {
	test("publicados que exigen capacitador y no tienen ninguno vigente", async () => {
		const { repository, calls } = createHarness();

		await repository.findWithoutActiveTrainer({ dependencyId: 3 }, 6);

		expect(calls[0]).toMatchObject({
			where: {
				AND: [
					{ dependencyId: 3 },
					{ status: "PUBLISHED" },
					{ OR: [{ format: "SCHEDULED" }, { modality: "HYBRID" }] },
					{
						trainers: {
							none: {
								user: {
									archivedAt: null,
									trainerProfile: { is: { archivedAt: null } },
								},
							},
						},
					},
				],
			},
			take: 6,
		});
	});
});
