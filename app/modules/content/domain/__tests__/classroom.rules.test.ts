import { describe, expect, test } from "vitest";
import {
	assertCanProgress,
	assertClassroomReadable,
	measuredLessonsOf,
	neighborsOf,
	nextProgressStatus,
	progressPercentOf,
	resumeLessonOf,
} from "../classroom.rules";
import type { ClassroomCourse } from "../classroom.types";
import { CONTENT_ERROR_CODES } from "../content.errors";
import {
	COURSE_DOC,
	LESSON_1,
	LESSON_2,
	LESSON_3,
	lessonOf,
	moduleOf,
	treeOf,
} from "./content.fixtures";

const codeOf = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return null;
};

const courseOf = (
	overrides: Partial<ClassroomCourse> = {},
): ClassroomCourse => ({
	id: 7,
	documentId: COURSE_DOC,
	title: "Transparencia",
	status: "PUBLISHED",
	format: "SELF_PACED",
	completionRule: "CONTENT",
	requiresEvaluation: false,
	evaluationMethod: "MANUAL",
	enrollment: {
		status: "ENROLLED",
		progressPercent: 0,
		contentCompletedAt: null,
		completed: false,
	},
	...overrides,
});

/** Las tres lecciones opcionales: nada obligatorio que medir. */
const allOptional = () =>
	treeOf().map((module) => ({
		...module,
		lessons: module.lessons.map((lesson) => ({ ...lesson, isRequired: false })),
	}));

describe("progressPercentOf", () => {
	test("solo cuentan las obligatorias", () => {
		expect(progressPercentOf(treeOf(), new Set([LESSON_1]))).toBe(50);
		expect(progressPercentOf(treeOf(), new Set([LESSON_3]))).toBe(0);
		expect(progressPercentOf(treeOf(), new Set([LESSON_1, LESSON_2]))).toBe(
			100,
		);
	});

	// Con el mismo criterio que `attendancePercent`: 100 solo si no falta nada.
	test("redondea hacia abajo", () => {
		const tree = [
			moduleOf({
				lessons: [
					lessonOf(),
					lessonOf({ documentId: LESSON_2 }),
					lessonOf({ documentId: LESSON_3 }),
				],
			}),
		];

		expect(progressPercentOf(tree, new Set([LESSON_1, LESSON_2]))).toBe(66);
	});

	test("sin obligatorias cuenta el temario entero", () => {
		expect(measuredLessonsOf(allOptional())).toHaveLength(3);
		expect(progressPercentOf(allOptional(), new Set([LESSON_1]))).toBe(33);
		expect(
			progressPercentOf(allOptional(), new Set([LESSON_1, LESSON_2, LESSON_3])),
		).toBe(100);
	});

	test("un temario vacío da 0 y nunca completa", () => {
		expect(progressPercentOf([], new Set())).toBe(0);
		expect(progressPercentOf([moduleOf({ lessons: [] })], new Set())).toBe(0);
	});

	test("una lección que ya no está en el temario no cuenta", () => {
		expect(progressPercentOf(treeOf(), new Set(["archivada", LESSON_1]))).toBe(
			50,
		);
	});
});

describe("resumeLessonOf", () => {
	test("lleva a la primera obligatoria sin completar", () => {
		expect(resumeLessonOf(treeOf(), new Set())).toBe(LESSON_1);
		expect(resumeLessonOf(treeOf(), new Set([LESSON_1]))).toBe(LESSON_2);
	});

	test("hechas las obligatorias, la primera sin completar", () => {
		expect(resumeLessonOf(treeOf(), new Set([LESSON_1, LESSON_2]))).toBe(
			LESSON_3,
		);
	});

	test("con todo hecho vuelve al principio; sin temario no hay a dónde", () => {
		expect(
			resumeLessonOf(treeOf(), new Set([LESSON_1, LESSON_2, LESSON_3])),
		).toBe(LESSON_1);
		expect(resumeLessonOf([], new Set())).toBeNull();
	});
});

describe("nextProgressStatus", () => {
	test("abrir una lección completada no la devuelve a empezada", () => {
		expect(nextProgressStatus("COMPLETED", "IN_PROGRESS")).toBe("COMPLETED");
	});

	test("de nada o de empezada avanza a lo que se pide", () => {
		expect(nextProgressStatus(null, "IN_PROGRESS")).toBe("IN_PROGRESS");
		expect(nextProgressStatus("IN_PROGRESS", "COMPLETED")).toBe("COMPLETED");
	});
});

describe("neighborsOf", () => {
	test("cruza de un módulo al siguiente", () => {
		expect(neighborsOf(treeOf(), LESSON_2)).toEqual({
			previous: LESSON_1,
			next: LESSON_3,
		});
		expect(neighborsOf(treeOf(), LESSON_1).previous).toBeNull();
		expect(neighborsOf(treeOf(), LESSON_3).next).toBeNull();
	});
});

describe("quién entra al aula", () => {
	test("la inscripción activa de un curso publicado lee y avanza", () => {
		expect(() => assertCanProgress(courseOf())).not.toThrow();
	});

	test("sin inscripción activa no se avanza", () => {
		expect(
			codeOf(() => assertCanProgress(courseOf({ enrollment: null }))),
		).toBe(CONTENT_ERROR_CODES.NOT_ENROLLED);
		expect(
			codeOf(() =>
				assertCanProgress(
					courseOf({
						enrollment: {
							status: "WITHDRAWN",
							progressPercent: 50,
							contentCompletedAt: null,
							completed: false,
						},
					}),
				),
			),
		).toBe(CONTENT_ERROR_CODES.NOT_ENROLLED);
	});

	test("un curso finalizado se lee pero ya no registra avance", () => {
		const finished = courseOf({ status: "FINISHED" });

		expect(() => assertClassroomReadable(finished)).not.toThrow();
		expect(codeOf(() => assertCanProgress(finished))).toBe(
			CONTENT_ERROR_CODES.CLASSROOM_READ_ONLY,
		);
	});

	test.each(["DRAFT", "CANCELLED"] as const)(
		"un curso %s se ve igual que inexistente",
		(status) => {
			expect(codeOf(() => assertClassroomReadable(courseOf({ status })))).toBe(
				CONTENT_ERROR_CODES.COURSE_NOT_FOUND,
			);
		},
	);
});
