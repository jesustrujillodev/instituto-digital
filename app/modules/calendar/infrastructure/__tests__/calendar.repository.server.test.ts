import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createCalendarRepository } from "../calendar.repository.server";

const FROM = new Date("2026-09-28T07:00:00.000Z");
const TO = new Date("2026-11-02T08:00:00.000Z");
const COURSE_FILTER = { OR: [{ trainers: { some: { userId: 50 } } }] };

/**
 * Doble de Prisma que registra la consulta. La regla de quién ve qué ya la
 * prueban `calendar.access` y `calendar.rules`; aquí se comprueba que el
 * repositorio la aplique en el `where` y proyecte lo que el etiquetado necesita.
 */
const createHarness = () => {
	const calls: Record<string, unknown>[] = [];

	const repository = createCalendarRepository({
		prisma: {
			courseSession: {
				findMany: async (args: Record<string, unknown>) => {
					calls.push(args);
					return [];
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, calls };
};

describe("findSessions", () => {
	test("acota por el rango y por el filtro de cursos ya resuelto", async () => {
		const { repository, calls } = createHarness();

		await repository.findSessions({
			from: FROM,
			to: TO,
			courseFilter: COURSE_FILTER,
			viewerId: 50,
			staffDependencyId: null,
		});

		expect(calls[0]).toMatchObject({
			where: {
				startsAt: { gte: FROM, lt: TO },
				course: COURSE_FILTER,
			},
			orderBy: [{ startsAt: "asc" }, { id: "asc" }],
		});
	});

	test("lee solo la inscripción activa de quien consulta", async () => {
		const { repository, calls } = createHarness();

		await repository.findSessions({
			from: FROM,
			to: TO,
			courseFilter: COURSE_FILTER,
			viewerId: 50,
			staffDependencyId: null,
		});

		expect(calls[0]).toMatchObject({
			select: {
				course: {
					select: {
						enrollments: {
							where: { userId: 50, status: { in: ["INVITED", "ENROLLED"] } },
						},
						_count: {
							select: { enrollments: { where: { id: { in: [] } } } },
						},
					},
				},
			},
		});
	});

	test("con personal, cuenta los inscritos de esa dependencia actual", async () => {
		const { repository, calls } = createHarness();

		await repository.findSessions({
			from: FROM,
			to: TO,
			courseFilter: COURSE_FILTER,
			viewerId: 50,
			staffDependencyId: 3,
		});

		expect(calls[0]).toMatchObject({
			select: {
				course: {
					select: {
						_count: {
							select: {
								enrollments: {
									where: { status: "ENROLLED", user: { dependencyId: 3 } },
								},
							},
						},
					},
				},
			},
		});
	});
});
