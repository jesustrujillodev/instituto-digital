import { describe, expect, test } from "vitest";
import { classroomProgressNote } from "../content-labels";

const base = {
	countsContent: false,
	readOnly: false,
	contentCompletedAt: null,
	completed: false,
	withModuleQuizzes: false,
	withFinalQuiz: false,
	withLessons: true,
};

describe("classroomProgressNote", () => {
	test("sin examen, el temario que no cuenta es material de apoyo", () => {
		expect(classroomProgressNote(base)).toBe(
			"Material de apoyo: recorrerlo no cuenta para acreditar la capacitación.",
		);
	});

	// Antes la nota decía que nada contaba justo encima del examen que sí cuenta.
	test("con examen final, aclara que el examen sí cuenta", () => {
		expect(classroomProgressNote({ ...base, withFinalQuiz: true })).toBe(
			"Las lecciones son material de apoyo; el examen final sí cuenta para acreditar la capacitación.",
		);
	});

	test("sin lecciones, solo menciona el examen", () => {
		expect(
			classroomProgressNote({
				...base,
				withFinalQuiz: true,
				withLessons: false,
			}),
		).toBe("El examen final cuenta para acreditar la capacitación.");
	});

	test("si ya acreditó, lo dice aunque el temario no cuente", () => {
		expect(
			classroomProgressNote({ ...base, withFinalQuiz: true, completed: true }),
		).toBe("Acreditaste la capacitación.");
	});

	test("con el temario obligatorio pide completar las lecciones", () => {
		expect(classroomProgressNote({ ...base, countsContent: true })).toBe(
			"Completa las lecciones obligatorias para terminar la capacitación.",
		);
	});
});
