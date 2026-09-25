import { describe, expect, test } from "vitest";
import type {
	ContentLesson,
	ContentModule,
	CourseContentTree,
} from "../../domain/content.types";
import {
	findLesson,
	formatMinutes,
	initialSelection,
	neighborsOf,
	outlineStats,
	selectionExists,
	withLessonMoved,
	withModuleMoved,
} from "../content-outline";

const lessonOf = (
	documentId: string,
	overrides: Partial<ContentLesson> = {},
): ContentLesson => ({
	documentId,
	title: documentId,
	type: "TEXT",
	order: 0,
	isRequired: true,
	estimatedMinutes: null,
	hasMaterial: true,
	...overrides,
});

const moduleOf = (
	documentId: string,
	lessons: ContentLesson[],
	overrides: Partial<ContentModule> = {},
): ContentModule => ({
	documentId,
	title: documentId,
	description: null,
	order: 0,
	lessons,
	quiz: null,
	...overrides,
});

const TREE: CourseContentTree = [
	moduleOf("m1", [
		lessonOf("l1", { estimatedMinutes: 20 }),
		lessonOf("l2", { estimatedMinutes: 15, hasMaterial: false }),
	]),
	moduleOf("m2", []),
	moduleOf("m3", [lessonOf("l3")], {
		quiz: { documentId: "q3", title: "Evaluación", questionCount: 2 },
	}),
];

describe("outlineStats", () => {
	test("cuenta módulos, lecciones, minutos y lecciones sin material", () => {
		expect(outlineStats(TREE)).toEqual({
			modules: 3,
			lessons: 3,
			minutes: 35,
			withoutMaterial: 1,
		});
	});
});

describe("findLesson", () => {
	test("ubica la lección con su módulo y sus índices", () => {
		expect(findLesson(TREE, "l3")).toMatchObject({
			moduleIndex: 2,
			lessonIndex: 0,
			module: { documentId: "m3" },
		});
	});

	test("una lección que ya no está no se encuentra", () => {
		expect(findLesson(TREE, "archivada")).toBeNull();
	});
});

describe("neighborsOf", () => {
	test("cruza módulos y salta los vacíos", () => {
		expect(neighborsOf(TREE, "l2")).toEqual({ previous: "l1", next: "l3" });
	});

	test("en los extremos no hay vecino", () => {
		expect(neighborsOf(TREE, "l1").previous).toBeNull();
		expect(neighborsOf(TREE, "l3").next).toBeNull();
	});
});

describe("selectionExists", () => {
	test("la evaluación se puede seleccionar para crearla, si el módulo sigue", () => {
		expect(
			selectionExists(TREE, { kind: "quiz", moduleDocumentId: "m1" }),
		).toBe(true);
		expect(
			selectionExists(TREE, { kind: "quiz", moduleDocumentId: "archivado" }),
		).toBe(false);
	});

	test("una lección archivada deja de existir", () => {
		expect(
			selectionExists(TREE, { kind: "lesson", documentId: "archivada" }),
		).toBe(false);
	});
});

describe("initialSelection", () => {
	test("abre la primera lección aunque el primer módulo esté vacío", () => {
		expect(initialSelection([moduleOf("m0", []), ...TREE])).toEqual({
			kind: "lesson",
			documentId: "l1",
		});
	});

	test("sin lecciones abre el primer módulo, y sin módulos nada", () => {
		expect(initialSelection([moduleOf("m0", [])])).toEqual({
			kind: "module",
			documentId: "m0",
		});
		expect(initialSelection([])).toBeNull();
	});
});

describe("formatMinutes", () => {
	test.each([
		[35, "35 min"],
		[60, "1 h"],
		[65, "1 h 5 min"],
	])("%i se lee %s", (minutes, label) => {
		expect(formatMinutes(minutes)).toBe(label);
	});
});

describe("reordenar", () => {
	test("mover un módulo manda el orden completo", () => {
		expect(withModuleMoved(TREE, 0, 1).modules).toEqual(["m2", "m1", "m3"]);
	});

	test("mover una lección solo toca su módulo", () => {
		const order = withLessonMoved(TREE, 0, 1, -1);

		expect(order.modules).toEqual(["m1", "m2", "m3"]);
		expect(order.lessons).toEqual([
			{ moduleDocumentId: "m1", lessonDocumentIds: ["l2", "l1"] },
			{ moduleDocumentId: "m2", lessonDocumentIds: [] },
			{ moduleDocumentId: "m3", lessonDocumentIds: ["l3"] },
		]);
	});
});
