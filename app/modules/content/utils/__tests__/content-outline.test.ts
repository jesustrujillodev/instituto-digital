import { describe, expect, test } from "vitest";
import type {
	ContentLesson,
	ContentModule,
	CourseContentTree,
} from "../../domain/content.types";
import { CONTENT_INTENTS, INTENT_FIELD, PAYLOAD_FIELD } from "../content-form";
import {
	findLesson,
	formatMinutes,
	initialSelection,
	neighborsOf,
	outlineStats,
	pendingCreationOf,
	pendingOutlineChangeOf,
	selectionExists,
	withLessonMoved,
	withModuleMoved,
	withOrder,
	withPendingChange,
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
		quiz: {
			documentId: "q3",
			title: "Evaluación",
			questionCount: 2,
			maxAttempts: 1,
		},
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

	test("una lección borrada deja de existir", () => {
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

const idsOf = (tree: CourseContentTree) =>
	tree.map((module) => [
		module.documentId,
		module.lessons.map((lesson) => lesson.documentId),
	]);

describe("withOrder", () => {
	test("aplica el orden que se manda al servidor", () => {
		const moved = withOrder(TREE, withModuleMoved(TREE, 0, 1));

		expect(idsOf(moved)).toEqual([
			["m2", []],
			["m1", ["l1", "l2"]],
			["m3", ["l3"]],
		]);
	});

	test("mueve una lección dentro de su módulo", () => {
		const moved = withOrder(TREE, withLessonMoved(TREE, 0, 1, -1));

		expect(idsOf(moved)[0]).toEqual(["m1", ["l2", "l1"]]);
	});

	test("lo que el orden no nombra queda al final, en su orden", () => {
		const moved = withOrder(TREE, {
			modules: ["m3"],
			lessons: [],
		});

		expect(idsOf(moved).map(([id]) => id)).toEqual(["m3", "m1", "m2"]);
	});
});

describe("withPendingChange", () => {
	test("sin cambio en vuelo, el árbol queda igual", () => {
		expect(withPendingChange(TREE, null)).toBe(TREE);
	});

	test("borrar una lección la quita ya", () => {
		const tree = withPendingChange(TREE, {
			kind: "delete-lesson",
			lessonDocumentId: "l1",
		});

		expect(idsOf(tree)[0]).toEqual(["m1", ["l2"]]);
	});

	test("borrar un módulo lo quita con sus lecciones", () => {
		const tree = withPendingChange(TREE, {
			kind: "delete-module",
			moduleDocumentId: "m1",
		});

		expect(idsOf(tree).map(([id]) => id)).toEqual(["m2", "m3"]);
	});

	test("eliminar la evaluación de un módulo deja el módulo sin ella", () => {
		const tree = withPendingChange(TREE, {
			kind: "delete-module-quiz",
			moduleDocumentId: "m3",
		});

		expect(tree[2].quiz).toBeNull();
		expect(tree[2].lessons).toHaveLength(1);
	});
});

describe("pendingOutlineChangeOf", () => {
	const formOf = (intent: string, payload: unknown) => {
		const formData = new FormData();
		formData.set(INTENT_FIELD, intent);
		formData.set(PAYLOAD_FIELD, JSON.stringify(payload));
		return formData;
	};

	test("lee un reordenamiento", () => {
		const order = withModuleMoved(TREE, 0, 1);

		expect(
			pendingOutlineChangeOf(formOf(CONTENT_INTENTS.reorder, order)),
		).toEqual({ kind: "reorder", order });
	});

	test.each([
		[
			CONTENT_INTENTS.deleteLesson,
			{ lessonDocumentId: "l1" },
			{ kind: "delete-lesson", lessonDocumentId: "l1" },
		],
		[
			CONTENT_INTENTS.deleteModule,
			{ moduleDocumentId: "m1" },
			{ kind: "delete-module", moduleDocumentId: "m1" },
		],
		[
			CONTENT_INTENTS.deleteModuleQuiz,
			{ moduleDocumentId: "m3" },
			{ kind: "delete-module-quiz", moduleDocumentId: "m3" },
		],
	])("lee %s", (intent, payload, expected) => {
		expect(pendingOutlineChangeOf(formOf(intent, payload))).toEqual(expected);
	});

	test("crear no se adelanta: necesita la respuesta del servidor", () => {
		expect(
			pendingOutlineChangeOf(
				formOf(CONTENT_INTENTS.createModule, { title: "Módulo 2" }),
			),
		).toBeNull();
	});

	test("sin envío o con un cuerpo malformado no hay cambio", () => {
		expect(pendingOutlineChangeOf(undefined)).toBeNull();
		expect(
			pendingOutlineChangeOf(formOf(CONTENT_INTENTS.deleteLesson, {})),
		).toBeNull();
		expect(
			pendingOutlineChangeOf(formOf(CONTENT_INTENTS.reorder, { modules: 1 })),
		).toBeNull();
	});
});

describe("pendingCreationOf", () => {
	const formOf = (intent: string, payload: unknown) => {
		const formData = new FormData();
		formData.set(INTENT_FIELD, intent);
		formData.set(PAYLOAD_FIELD, JSON.stringify(payload));
		return formData;
	};

	test("un módulo nuevo aparta su sitio al final", () => {
		expect(
			pendingCreationOf(formOf(CONTENT_INTENTS.createModule, { title: "M" })),
		).toEqual({ kind: "module" });
	});

	test("una lección nueva lo aparta en su módulo", () => {
		expect(
			pendingCreationOf(
				formOf(CONTENT_INTENTS.createLesson, { moduleDocumentId: "m1" }),
			),
		).toEqual({ kind: "lesson", moduleDocumentId: "m1" });
	});

	test("otra intención no crea nada", () => {
		expect(
			pendingCreationOf(formOf(CONTENT_INTENTS.reorder, { modules: [] })),
		).toBeNull();
		expect(pendingCreationOf(undefined)).toBeNull();
	});
});
