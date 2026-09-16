import { describe, expect, test } from "vitest";
import {
	canCorrect,
	canTeach,
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

	test("el capacitador interno solo imparte lo asignado, no lo que creó", () => {
		const scope = resolveTeachingScope(actorOf());

		expect(teachingCourseWhere(scope)).toEqual({
			OR: [{ trainers: { some: { userId: 9 } } }],
		});
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
