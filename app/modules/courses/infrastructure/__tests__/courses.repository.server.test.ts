import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createCourseRepository } from "../courses.repository.server";

const AT = new Date("2026-09-03T17:00:00.000Z");

const createHarness = (count: number) => {
	const calls: Record<string, unknown>[] = [];

	const repository = createCourseRepository({
		prisma: {
			course: {
				updateMany: async (args: Record<string, unknown>) => {
					calls.push(args);
					return { count };
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("finish", () => {
	test("solo pasa a FINISHED un curso que sigue publicado", async () => {
		const { repository, calls } = createHarness(1);

		expect(await repository.finish(10, AT)).toBe(true);
		expect(calls[0]).toEqual({
			where: { id: 10, status: "PUBLISHED" },
			data: { status: "FINISHED", finishedAt: AT },
		});
	});

	test("si otra petición se adelantó, devuelve false", async () => {
		const { repository } = createHarness(0);

		expect(await repository.finish(10, AT)).toBe(false);
	});
});
