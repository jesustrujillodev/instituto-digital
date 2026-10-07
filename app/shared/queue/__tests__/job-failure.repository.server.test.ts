import { describe, expect, test } from "vitest";
import type { ICradle } from "../../di/container.types";
import { createJobFailureRepository } from "../job-failure.repository.server";

const createHarness = () => {
	const log = {
		created: [] as Record<string, unknown>[],
		deleted: [] as Record<string, unknown>[],
	};
	const repository = createJobFailureRepository({
		prisma: {
			jobFailure: {
				create: async ({ data }: { data: Record<string, unknown> }) => {
					log.created.push(data);
				},
				deleteMany: async (args: Record<string, unknown>) => {
					log.deleted.push(args);
					return { count: 4 };
				},
			},
		} as unknown as ICradle["prisma"],
	});
	return { repository, log };
};

describe("jobFailureRepository", () => {
	test("guarda el fallo con el error recortado", async () => {
		const { repository, log } = createHarness();

		await repository.record({
			queue: "storage",
			name: "delete-object",
			jobId: "12",
			payload: { bucket: "b", key: "k" },
			error: "x".repeat(5_000),
			attempts: 5,
		});

		expect(log.created[0]).toMatchObject({
			queue: "storage",
			jobId: "12",
			attempts: 5,
		});
		expect((log.created[0].error as string).length).toBe(2_000);
	});

	test("purga los anteriores a la fecha y devuelve cuántos", async () => {
		const { repository, log } = createHarness();
		const before = new Date("2026-09-06T00:00:00.000Z");

		expect(await repository.purgeBefore(before)).toBe(4);
		expect(log.deleted).toEqual([{ where: { failedAt: { lt: before } } }]);
	});
});

describe("lecturas de Operación", () => {
	const createReader = () => {
		const calls = {
			findMany: [] as Record<string, unknown>[],
			count: [] as unknown[],
		};
		const repository = createJobFailureRepository({
			prisma: {
				jobFailure: {
					findMany: async (args: Record<string, unknown>) => {
						calls.findMany.push(args);
						return [];
					},
					count: async (args?: unknown) => {
						calls.count.push(args);
						return 0;
					},
				},
			} as unknown as ICradle["prisma"],
		});
		return { repository, calls };
	};

	test("findPage nunca lee el payload, que puede llevar datos personales", async () => {
		const { repository, calls } = createReader();

		await repository.findPage({ skip: 0, take: 20 });

		const select = calls.findMany[0].select as Record<string, unknown>;
		expect(select).not.toHaveProperty("payload");
		expect(calls.findMany[0]).toMatchObject({
			orderBy: [{ failedAt: "desc" }, { id: "desc" }],
			skip: 0,
			take: 20,
		});
	});

	test("cuenta todos o solo los recientes", async () => {
		const { repository, calls } = createReader();
		const since = new Date("2026-09-30T18:00:00.000Z");

		await repository.count();
		await repository.countSince(since);

		expect(calls.count).toEqual([
			undefined,
			{ where: { failedAt: { gte: since } } },
		]);
	});
});
