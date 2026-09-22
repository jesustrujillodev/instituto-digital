import { describe, expect, test } from "vitest";
import {
	type ContentModuleRaw,
	toContentSummary,
	toCourseContentTree,
} from "../content.mapper";
import { LESSON_1, LESSON_2, MODULE_A, treeOf } from "./content.fixtures";

const raw: ContentModuleRaw[] = [
	{
		documentId: MODULE_A,
		title: "Fundamentos",
		description: "Lo básico",
		order: 1,
		lessons: [
			{
				documentId: LESSON_1,
				title: "Qué es la transparencia",
				type: "TEXT",
				order: 1,
				isRequired: true,
				estimatedMinutes: 20,
			},
			{
				documentId: LESSON_2,
				title: "Marco legal",
				type: "LINK",
				order: 2,
				isRequired: false,
				estimatedMinutes: null,
			},
		],
	},
];

describe("toCourseContentTree", () => {
	test("la fila cruda se vuelve árbol sin perder nada", () => {
		expect(toCourseContentTree(raw)).toEqual([
			{
				documentId: MODULE_A,
				title: "Fundamentos",
				description: "Lo básico",
				order: 1,
				lessons: [
					{
						documentId: LESSON_1,
						title: "Qué es la transparencia",
						type: "TEXT",
						order: 1,
						isRequired: true,
						estimatedMinutes: 20,
					},
					{
						documentId: LESSON_2,
						title: "Marco legal",
						type: "LINK",
						order: 2,
						isRequired: false,
						estimatedMinutes: null,
					},
				],
			},
		]);
	});

	test("un curso sin temario devuelve un árbol vacío", () => {
		expect(toCourseContentTree([])).toEqual([]);
	});
});

describe("toContentSummary", () => {
	test("cuenta módulos, lecciones y cuáles son obligatorias", () => {
		expect(toContentSummary(treeOf())).toEqual({
			moduleCount: 2,
			lessonCount: 3,
			requiredLessonCount: 2,
		});
	});

	test("sin temario, todo en cero", () => {
		expect(toContentSummary([])).toEqual({
			moduleCount: 0,
			lessonCount: 0,
			requiredLessonCount: 0,
		});
	});
});
