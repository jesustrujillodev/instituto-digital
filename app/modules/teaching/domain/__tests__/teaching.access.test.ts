import { describe, expect, test } from "vitest";
import {
	canCorrect,
	canTeach,
	ownTeachingScope,
	resolveTeachingScope,
	teachingCourseWhere,
} from "../teaching.access";
import { actorOf } from "./teaching.fixtures";

describe("resolveTeachingScope", () => {
	test("el superadministrador imparte todo", () => {
		const scope = resolveTeachingScope(
			actorOf({ role: "SUPERADMIN", dependencyId: null, isTrainer: false }),
		);

		expect(teachingCourseWhere(scope)).toEqual({});
	});

	test("un auxiliar capacitador suma su dependencia y lo que imparte fuera", () => {
		const scope = resolveTeachingScope(actorOf({ role: "DEPENDENCY_DEPUTY" }));

		expect(teachingCourseWhere(scope)).toEqual({
			OR: [{ dependencyId: 3 }, { trainers: { some: { userId: 9 } } }],
		});
	});

	// Lo que creó y tiene sesiones lo imparte otro: ahí no pasa lista. El
	// autogestivo sin sesiones no lo imparte nadie, y si no lo opera él no lo
	// opera ningún capacitador.
	test("el capacitador interno imparte lo asignado y opera sus autogestivos sin sesiones", () => {
		const scope = resolveTeachingScope(actorOf());

		expect(teachingCourseWhere(scope)).toEqual({
			OR: [
				{ trainers: { some: { userId: 9 } } },
				{
					dependencyId: 3,
					createdById: 9,
					format: "SELF_PACED",
					modality: { not: "HYBRID" },
				},
			],
		});
	});

	test("el titular no suma rama de autor: su dependencia ya lo cubre", () => {
		const scope = resolveTeachingScope(
			actorOf({ role: "DEPENDENCY_HEAD", isTrainer: false }),
		);

		expect(scope.creator).toBeNull();
		expect(teachingCourseWhere(scope)).toEqual({ OR: [{ dependencyId: 3 }] });
	});

	test("el capacitador externo no tiene rama de autor: no crea cursos", () => {
		const scope = resolveTeachingScope(actorOf({ dependencyId: null }));

		expect(scope.creator).toBeNull();
	});

	test("el capacitador externo, sin dependencia, también imparte", () => {
		const scope = resolveTeachingScope(actorOf({ dependencyId: null }));

		expect(canTeach(scope)).toBe(true);
	});

	test("un participante sin perfil no imparte nada y nunca recibe {}", () => {
		const scope = resolveTeachingScope(actorOf({ isTrainer: false }));

		expect(canTeach(scope)).toBe(false);
		expect(teachingCourseWhere(scope)).toEqual({ id: { in: [] } });
	});
});

describe("canCorrect", () => {
	test("solo el alcance global y la dependencia organizadora corrigen", () => {
		const trainer = resolveTeachingScope(actorOf());
		const head = resolveTeachingScope(
			actorOf({ role: "DEPENDENCY_HEAD", isTrainer: false }),
		);
		const superadmin = resolveTeachingScope(
			actorOf({ role: "SUPERADMIN", dependencyId: null, isTrainer: false }),
		);

		expect(canCorrect(trainer, 3)).toBe(false);
		expect(canCorrect(head, 3)).toBe(true);
		expect(canCorrect(head, 4)).toBe(false);
		expect(canCorrect(superadmin, 4)).toBe(true);
	});
});

describe("ownTeachingScope", () => {
	test("quita el alcance global y el de autor, y conserva dependencia y capacitador", () => {
		expect(
			ownTeachingScope(actorOf({ role: "DEPENDENCY_DEPUTY", isTrainer: true })),
		).toEqual({ global: false, dependencyId: 3, trainerId: 9, creator: null });
		expect(
			ownTeachingScope(
				actorOf({ role: "SUPERADMIN", dependencyId: null, isTrainer: false }),
			),
		).toEqual({
			global: false,
			dependencyId: null,
			trainerId: null,
			creator: null,
		});
	});

	test("el capacitador interno conserva lo que imparte y pierde lo que solo creó", () => {
		expect(ownTeachingScope(actorOf())).toEqual({
			global: false,
			dependencyId: null,
			trainerId: 9,
			creator: null,
		});
	});
});
