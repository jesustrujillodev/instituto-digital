import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createProgressRecalculation } from "../progress-recalculation.server";

const AT = "2026-10-06T18:00:00.000Z";

const createHarness = (status: string | null) => {
	const calls = {
		recalculated: [] as { courseId: number; actorId: number; at: Date }[],
		transactions: 0,
	};
	const recalculate = createProgressRecalculation({
		runInTransaction: (async <T>(work: () => Promise<T>) => {
			calls.transactions += 1;
			return work();
		}) as unknown as ICradle["runInTransaction"],
		contentRepository: {
			findCourseRef: async (courseId: number) =>
				status === null ? null : { id: courseId, status },
		} as unknown as ICradle["contentRepository"],
		progressSync: {
			recalculate: async (
				course: { id: number },
				actorId: number,
				at: Date,
			) => {
				calls.recalculated.push({ courseId: course.id, actorId, at });
				return [];
			},
		} as unknown as ICradle["progressSync"],
	});
	return { recalculate, calls };
};

describe("createProgressRecalculation", () => {
	test("recalcula un curso publicado, en su transacción y con la fecha del cambio", async () => {
		const { recalculate, calls } = createHarness("PUBLISHED");

		await recalculate({ courseId: 7, actorId: 3, at: AT });

		expect(calls.transactions).toBe(1);
		expect(calls.recalculated).toEqual([
			{ courseId: 7, actorId: 3, at: new Date(AT) },
		]);
	});

	// Entre encolar y correr el curso pudo finalizarse o cancelarse.
	test.each(["FINISHED", "CANCELLED", null])(
		"un curso %s ya no tiene avance que recalcular",
		async (status) => {
			const { recalculate, calls } = createHarness(status);

			await recalculate({ courseId: 7, actorId: 3, at: AT });

			expect(calls.recalculated).toEqual([]);
		},
	);
});
