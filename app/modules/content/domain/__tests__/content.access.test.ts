import { describe, expect, test } from "vitest";
import {
	lessonMaterialReadWhere,
	sessionMaterialReadWhere,
} from "../content.access";
import { actorOf } from "./content.fixtures";

const NOW = new Date("2026-10-10T18:00:00.000Z");

const enrolled = { enrollments: { some: { userId: 9, status: "ENROLLED" } } };

describe("lessonMaterialReadWhere", () => {
	const classroom = {
		lesson: {
			archivedAt: null,
			module: {
				archivedAt: null,
				course: { status: { in: ["PUBLISHED", "FINISHED"] }, ...enrolled },
			},
		},
	};

	// Igual que el aula: inscripción activa en un curso publicado o finalizado,
	// y solo las lecciones vigentes.
	test("quien no administra cursos solo lee el aula en la que está inscrito", () => {
		expect(
			lessonMaterialReadWhere(
				actorOf({ userId: 9, role: "USER", dependencyId: 3, isTrainer: false }),
			),
		).toEqual({ OR: [classroom] });
	});

	test("quien administra lee además el temario de su alcance", () => {
		expect(
			lessonMaterialReadWhere(
				actorOf({ userId: 9, role: "DEPENDENCY_HEAD", dependencyId: 3 }),
			),
		).toEqual({
			OR: [classroom, { lesson: { module: { course: { dependencyId: 3 } } } }],
		});
	});

	test("el capacitador interno, solo lo que creó", () => {
		expect(
			lessonMaterialReadWhere(
				actorOf({ userId: 9, role: "USER", dependencyId: 3, isTrainer: true }),
			).OR[1],
		).toEqual({
			lesson: { module: { course: { dependencyId: 3, createdById: 9 } } },
		});
	});
});

describe("sessionMaterialReadWhere", () => {
	// Lo bloqueado hasta la sesión tampoco sale por el proxy.
	test("el inscrito lee el material una vez disponible", () => {
		expect(
			sessionMaterialReadWhere(
				actorOf({ userId: 9, role: "USER", dependencyId: 3, isTrainer: false }),
				NOW,
			),
		).toEqual({
			OR: [
				{
					session: { course: enrolled },
					OR: [
						{ availableFromSession: false },
						{ session: { startsAt: { lte: NOW } } },
					],
				},
			],
		});
	});

	test("quien administra o imparte el curso lo lee todo", () => {
		const where = sessionMaterialReadWhere(
			actorOf({ userId: 9, role: "DEPENDENCY_HEAD", dependencyId: 3 }),
			NOW,
		);

		expect(where.OR).toHaveLength(2);
		expect(where.OR[1]).toMatchObject({
			session: { course: { OR: expect.any(Array) } },
		});
	});
});
