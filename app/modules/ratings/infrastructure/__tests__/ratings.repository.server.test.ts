import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { RATING_ERROR_CODES } from "../../domain/rating.errors";
import { createRatingRepository } from "../ratings.repository.server";

const createHarness = (options: { createError?: Error } = {}) => {
	const calls: Record<string, Record<string, unknown>[]> = {
		findMany: [],
		findUnique: [],
	};

	const repository = createRatingRepository({
		prisma: {
			course: {
				findUnique: async (args: Record<string, unknown>) => {
					calls.findUnique.push(args);
					return {
						id: 10,
						status: "FINISHED",
						format: "SCHEDULED",
						enrollments: [{ status: "ENROLLED", completed: true }],
						ratings: [],
						_count: { sessions: 2 },
					};
				},
			},
			courseRating: {
				create: async () => {
					if (options.createError) throw options.createError;
				},
				findMany: async (args: Record<string, unknown>) => {
					calls.findMany.push(args);
					return [];
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("ratingRepository", () => {
	test("el resumen nunca proyecta al autor", async () => {
		const { repository, calls } = createHarness();

		await repository.summarizeCourse(10);

		expect(calls.findMany[0].select).toEqual({
			score: true,
			comment: true,
			createdAt: true,
		});
	});

	test("la elegibilidad cuenta solo sesiones asistidas por quien valora", async () => {
		const { repository, calls } = createHarness();

		const eligibility = await repository.findEligibility("c-doc", 50);

		expect(eligibility).toEqual({
			courseId: 10,
			courseStatus: "FINISHED",
			courseFormat: "SCHEDULED",
			enrollmentStatus: "ENROLLED",
			attendedSessions: 2,
			completed: true,
			alreadyRated: false,
		});
		expect(calls.findUnique[0]).toMatchObject({
			select: {
				_count: {
					select: {
						sessions: {
							where: { attendance: { some: { userId: 50, attended: true } } },
						},
					},
				},
			},
		});
	});

	test("la unicidad de la base se traduce a ALREADY_RATED", async () => {
		const { repository } = createHarness({
			createError: new Prisma.PrismaClientKnownRequestError("duplicado", {
				code: "P2002",
				clientVersion: "test",
			}),
		});

		const thrown = await repository
			.create({ courseId: 10, userId: 50, score: 4, comment: null })
			.catch((error) => error);

		expect(thrown.code).toBe(RATING_ERROR_CODES.ALREADY_RATED);
	});
});
