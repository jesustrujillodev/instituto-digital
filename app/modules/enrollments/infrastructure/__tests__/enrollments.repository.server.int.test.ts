import { afterAll, describe, expect, test } from "vitest";
import {
	createDbFixtures,
	raceTransactions,
} from "@/core/__tests__/db.fixtures";
import { prisma, runInTransaction } from "@/core/db.server";
import type { ICradle } from "@/shared/di/container.types";
import { createEnrollmentRepository } from "../enrollments.repository.server";

const repository = createEnrollmentRepository({
	prisma,
	assetUrlResolver: {} as ICradle["assetUrlResolver"],
});
const fixtures = createDbFixtures();

describe("bloqueos del curso contra Postgres", () => {
	afterAll(() => fixtures.cleanup());

	test("lockCourse serializa dos transacciones sobre el mismo curso", async () => {
		const course = await fixtures.course();

		const order = await raceTransactions(
			(hold) =>
				runInTransaction(async () => {
					await repository.lockCourse(course.id);
					await hold();
				}),
			() => runInTransaction(() => repository.lockCourse(course.id)),
		);

		expect(order).toEqual(["released", "first", "second"]);
	});

	test("lockCourse no espera por otro curso", async () => {
		const [locked, other] = await Promise.all([
			fixtures.course(),
			fixtures.course(),
		]);

		const order = await raceTransactions(
			(hold) =>
				runInTransaction(async () => {
					await repository.lockCourse(locked.id);
					await hold();
				}),
			() => runInTransaction(() => repository.lockCourse(other.id)),
		);

		expect(order).toEqual(["second", "released", "first"]);
	});

	test("dos lockCourseShared no se esperan, pero lockCourse espera a uno compartido", async () => {
		const course = await fixtures.course();

		const shared = await raceTransactions(
			(hold) =>
				runInTransaction(async () => {
					await repository.lockCourseShared(course.id);
					await hold();
				}),
			() => runInTransaction(() => repository.lockCourseShared(course.id)),
		);
		const exclusive = await raceTransactions(
			(hold) =>
				runInTransaction(async () => {
					await repository.lockCourseShared(course.id);
					await hold();
				}),
			() => runInTransaction(() => repository.lockCourse(course.id)),
		);

		expect(shared).toEqual(["second", "released", "first"]);
		expect(exclusive).toEqual(["released", "first", "second"]);
	});
});
