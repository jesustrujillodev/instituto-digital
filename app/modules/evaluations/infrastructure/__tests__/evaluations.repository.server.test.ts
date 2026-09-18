import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import {
	ANA_DOC,
	COURSE_DOC,
	EVALUATION_DOC,
} from "../../domain/__tests__/evaluation.fixtures";
import { createEvaluationRepository } from "../evaluations.repository.server";

const WHERE = { OR: [{ trainers: { some: { userId: 9 } } }] };
const AT = new Date("2026-09-03T18:00:00.000Z");

/** Doble de Prisma que registra cada consulta, sin tocar la base. */
const createHarness = () => {
	const calls: Record<string, Record<string, unknown>[]> = {
		courseFindFirst: [],
		evaluationFindFirst: [],
		evaluationFindMany: [],
		sessionFindFirst: [],
		create: [],
		update: [],
		delete: [],
		upsert: [],
		deleteMany: [],
	};

	const record =
		(key: string, value: unknown = null) =>
		async (args: Record<string, unknown>) => {
			calls[key].push(args);
			return value;
		};

	const repository = createEvaluationRepository({
		prisma: {
			course: { findFirst: record("courseFindFirst") },
			courseSession: { findFirst: record("sessionFindFirst") },
			courseEvaluation: {
				findFirst: record("evaluationFindFirst"),
				findMany: record("evaluationFindMany", []),
				create: record("create"),
				update: record("update"),
				delete: record("delete"),
			},
			evaluationResult: {
				upsert: record("upsert"),
				deleteMany: record("deleteMany"),
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("findCourse", () => {
	test("aplica el filtro del alcance junto al documentId", async () => {
		const { repository, calls } = createHarness();

		expect(await repository.findCourse(COURSE_DOC, WHERE)).toBeNull();
		expect(calls.courseFindFirst[0]).toMatchObject({
			where: { AND: [{ documentId: COURSE_DOC }, WHERE] },
		});
	});
});

describe("findTarget", () => {
	test("exige que la evaluación sea del curso y del alcance", async () => {
		const { repository, calls } = createHarness();

		expect(
			await repository.findTarget(COURSE_DOC, EVALUATION_DOC, WHERE),
		).toBeNull();
		expect(calls.evaluationFindFirst[0]).toMatchObject({
			where: {
				documentId: EVALUATION_DOC,
				course: { AND: [{ documentId: COURSE_DOC }, WHERE] },
			},
		});
	});

	test("solo mira a los inscritos", async () => {
		const { repository, calls } = createHarness();

		await repository.findTarget(COURSE_DOC, EVALUATION_DOC, WHERE);

		const select = calls.evaluationFindFirst[0].select as {
			course: { select: { enrollments: { where: unknown } } };
		};
		expect(select.course.select.enrollments.where).toEqual({
			status: "ENROLLED",
		});
	});
});

describe("findSessionId", () => {
	test("acota la sesión al curso", async () => {
		const { repository, calls } = createHarness();

		expect(await repository.findSessionId(10, ANA_DOC)).toBeNull();
		expect(calls.sessionFindFirst[0]).toMatchObject({
			where: { courseId: 10, documentId: ANA_DOC },
		});
	});
});

describe("saveResults", () => {
	test("escribe el veredicto, la observación y quién lo capturó", async () => {
		const { repository, calls } = createHarness();

		await repository.saveResults(
			7,
			[{ userId: 50, passed: false, note: "No entregó" }],
			[],
			9,
			AT,
		);

		expect(calls.upsert[0]).toEqual({
			where: { evaluationId_userId: { evaluationId: 7, userId: 50 } },
			create: {
				evaluationId: 7,
				userId: 50,
				passed: false,
				note: "No entregó",
				recordedById: 9,
				recordedAt: AT,
			},
			update: {
				passed: false,
				note: "No entregó",
				recordedById: 9,
				recordedAt: AT,
			},
		});
		expect(calls.deleteMany).toEqual([]);
	});

	test("las bajas se borran solo dentro de esta evaluación", async () => {
		const { repository, calls } = createHarness();

		await repository.saveResults(7, [], [50, 51], 9, AT);

		expect(calls.upsert).toEqual([]);
		expect(calls.deleteMany[0]).toEqual({
			where: { evaluationId: 7, userId: { in: [50, 51] } },
		});
	});
});
