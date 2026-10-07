import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createEnrollmentSummaryRepository } from "../enrollment-summary.repository.server";

const NOW = new Date("2026-09-16T18:00:00.000Z");

const createHarness = () => {
	const calls = {
		courses: [] as Record<string, unknown>[],
		invitations: [] as Record<string, unknown>[],
	};

	const repository = createEnrollmentSummaryRepository({
		prisma: {
			course: {
				findMany: async (args: Record<string, unknown>) => {
					calls.courses.push(args);
					return [
						{
							id: 7,
							documentId: "c-7",
							title: "Excel básico",
							format: "SCHEDULED",
							capacity: 20,
							enrollmentDeadline: null,
							sessions: [{ startsAt: new Date("2026-09-20T16:00:00.000Z") }],
							_count: { enrollments: 4 },
						},
					];
				},
			},
			enrollment: {
				groupBy: async (args: Record<string, unknown>) => {
					calls.invitations.push(args);
					return [{ courseId: 7, _count: { _all: 2 } }];
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("findOpenCourses", () => {
	test("acota por el alcance y la ventana abierta, con un tope", async () => {
		const { repository, calls } = createHarness();

		await repository.findOpenCourses({
			filter: { dependencyId: 3 },
			now: NOW,
			take: 100,
		});

		const where = calls.courses[0].where as { AND: unknown[] };
		expect(where.AND[0]).toEqual({ dependencyId: 3 });
		expect(where.AND).toContainEqual({ status: "PUBLISHED" });
		expect(where.AND).toContainEqual({ enrollmentClosedAt: null });
		expect(calls.courses[0].take).toBe(100);
	});

	test("cuenta las invitaciones pendientes con el mismo filtro de cursos", async () => {
		const { repository, calls } = createHarness();

		await repository.findOpenCourses({
			filter: { dependencyId: 3 },
			now: NOW,
			take: 100,
		});

		expect(calls.invitations[0]).toEqual({
			by: ["courseId"],
			where: { status: "INVITED", course: calls.courses[0].where },
			_count: { _all: true },
		});
	});

	test("une cada curso con su primera sesión, inscritos e invitados", async () => {
		const { repository } = createHarness();

		const [course] = await repository.findOpenCourses({
			filter: { dependencyId: 3 },
			now: NOW,
			take: 100,
		});

		expect(course).toEqual({
			id: 7,
			documentId: "c-7",
			title: "Excel básico",
			format: "SCHEDULED",
			capacity: 20,
			enrollmentDeadline: null,
			firstSessionAt: new Date("2026-09-20T16:00:00.000Z"),
			enrolled: 4,
			invited: 2,
		});
	});
});
