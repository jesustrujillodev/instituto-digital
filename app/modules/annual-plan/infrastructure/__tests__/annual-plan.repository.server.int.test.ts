import { afterAll, describe, expect, test } from "vitest";
import {
	createDbFixtures,
	raceTransactions,
} from "@/core/__tests__/db.fixtures";
import { prisma, runInTransaction } from "@/core/db.server";
import { createAnnualPlanRepository } from "../annual-plan.repository.server";

const repository = createAnnualPlanRepository({ prisma });
const fixtures = createDbFixtures();

describe("bloqueo de la línea del plan contra Postgres", () => {
	afterAll(() => fixtures.cleanup());

	test("lockLineForCourse devuelve la línea con su plan", async () => {
		const line = await fixtures.planLine();

		const locked = await runInTransaction(() =>
			repository.lockLineForCourse(line.documentId),
		);

		expect(locked).toEqual({
			id: line.id,
			cancelledAt: null,
			plan: { dependencyId: expect.any(Number), fiscalYear: 2026 },
			courses: [],
		});
	});

	test("dos altas sobre la misma línea pasan de una en una", async () => {
		const line = await fixtures.planLine();

		const order = await raceTransactions(
			(hold) =>
				runInTransaction(async () => {
					await repository.lockLineForCourse(line.documentId);
					await hold();
				}),
			async () => {
				await runInTransaction(() =>
					repository.lockLineForCourse(line.documentId),
				);
			},
		);

		expect(order).toEqual(["released", "first", "second"]);
	});
});
