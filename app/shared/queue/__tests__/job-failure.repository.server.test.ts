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
