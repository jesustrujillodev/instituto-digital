import { afterAll, describe, expect, test } from "vitest";
import {
	createDbFixtures,
	raceTransactions,
} from "@/core/__tests__/db.fixtures";
import { prisma, runInTransaction } from "@/core/db.server";
import { createCourseRepository } from "../courses.repository.server";

const repository = createCourseRepository({ prisma });
const fixtures = createDbFixtures();

describe("bloqueo del curso por documentId contra Postgres", () => {
	afterAll(() => fixtures.cleanup());

	test("lock serializa dos transacciones sobre el mismo curso", async () => {
		const course = await fixtures.course();

		const order = await raceTransactions(
			(hold) =>
				runInTransaction(async () => {
					await repository.lock(course.documentId);
					await hold();
				}),
			() => runInTransaction(() => repository.lock(course.documentId)),
		);

		expect(order).toEqual(["released", "first", "second"]);
	});
});
