import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createTrainerRepository } from "../trainers.repository.server";

const AT = new Date("2027-03-10T18:00:00.000Z");
const ANA_DOC = "11111111-1111-4111-8111-111111111111";
const LUIS_DOC = "22222222-2222-4222-8222-222222222222";

const profileOf = (userId: number, documentId: string) => ({
	userId,
	specialty: "Protección civil",
	institution: null,
	bio: null,
	archivedAt: null,
	createdAt: AT,
	updatedAt: AT,
	user: {
		documentId,
		firstName: "Ana",
		lastName: "Ruiz",
		email: `${userId}@instituto.gob.mx`,
		phone: null,
		type: "INTERNAL",
		dependency: { name: "Obras Públicas" },
	},
});

/** Doble de Prisma que registra cada consulta, sin tocar la base. */
const createHarness = (rows: {
	profiles: unknown[];
	assignments: { userId: number; courseId: number }[];
	ratings: { courseId: number; sum: number; count: number }[];
}) => {
	const calls: Record<string, unknown[]> = {
		profiles: [],
		assignments: [],
		ratings: [],
	};

	const repository = createTrainerRepository({
		prisma: {
			trainerProfile: {
				findMany: async (args: unknown) => {
					calls.profiles.push(args);
					return rows.profiles;
				},
			},
			courseTrainer: {
				findMany: async (args: unknown) => {
					calls.assignments.push(args);
					return rows.assignments;
				},
			},
			courseRating: {
				groupBy: async (args: unknown) => {
					calls.ratings.push(args);
					return rows.ratings.map((row) => ({
						courseId: row.courseId,
						_sum: { score: row.sum },
						_count: { _all: row.count },
					}));
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("trainerRepository.findByUserDocumentIds", () => {
	test("las tres lecturas parten de las mismas cuentas con perfil", async () => {
		const { repository, calls } = createHarness({
			profiles: [],
			assignments: [],
			ratings: [],
		});

		expect(await repository.findByUserDocumentIds([ANA_DOC])).toEqual([]);

		const trainerUsers = {
			documentId: { in: [ANA_DOC] },
			trainerProfile: { isNot: null },
		};
		expect(calls.profiles).toEqual([
			expect.objectContaining({
				where: { user: { documentId: { in: [ANA_DOC] } } },
			}),
		]);
		expect(calls.assignments).toEqual([
			expect.objectContaining({
				where: { user: trainerUsers, course: { status: "FINISHED" } },
			}),
		]);
		expect(calls.ratings).toEqual([
			expect.objectContaining({
				where: {
					course: {
						status: "FINISHED",
						trainers: { some: { user: trainerUsers } },
					},
				},
			}),
		]);
	});

	test("cuenta cursos impartidos y promedia por valoración, no por curso", async () => {
		const { repository } = createHarness({
			profiles: [profileOf(7, ANA_DOC), profileOf(9, LUIS_DOC)],
			assignments: [
				{ userId: 7, courseId: 100 },
				{ userId: 7, courseId: 101 },
			],
			ratings: [
				{ courseId: 100, sum: 15, count: 3 },
				{ courseId: 101, sum: 4, count: 1 },
			],
		});

		const result = await repository.findByUserDocumentIds([ANA_DOC, LUIS_DOC]);

		expect(result).toMatchObject([
			{ userDocumentId: ANA_DOC, coursesTaught: 2, averageRating: 19 / 4 },
			{ userDocumentId: LUIS_DOC, coursesTaught: 0, averageRating: null },
		]);
	});

	test("sin documentId no consulta", async () => {
		const { repository, calls } = createHarness({
			profiles: [],
			assignments: [],
			ratings: [],
		});

		expect(await repository.findByUserDocumentIds([])).toEqual([]);
		expect(calls.profiles).toEqual([]);
	});
});
