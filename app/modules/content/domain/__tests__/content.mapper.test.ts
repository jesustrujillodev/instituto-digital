import { describe, expect, test } from "vitest";
import { EMPTY_LESSON_BODY } from "../content.config";
import {
	type ContentModuleRaw,
	type LessonMaterialRaw,
	toContentSummary,
	toCourseContentTree,
	toLessonMaterial,
} from "../content.mapper";
import type { LessonType } from "../content.rules";
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
				content: { fileUrl: null, externalUrl: null },
				quiz: null,
			},
			{
				documentId: LESSON_2,
				title: "Marco legal",
				type: "LINK",
				order: 2,
				isRequired: false,
				estimatedMinutes: null,
				content: null,
				quiz: null,
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
						hasMaterial: true,
					},
					{
						documentId: LESSON_2,
						title: "Marco legal",
						type: "LINK",
						order: 2,
						isRequired: false,
						estimatedMinutes: null,
						hasMaterial: false,
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

describe("toLessonMaterial", () => {
	const lesson = (
		type: LessonType,
		content: LessonMaterialRaw["content"],
	): LessonMaterialRaw => ({
		documentId: LESSON_1,
		title: "Qué es la transparencia",
		type,
		content,
	});

	const EMPTY_CONTENT = {
		body: null,
		fileUrl: null,
		fileName: null,
		fileSize: null,
		mimeType: null,
		externalUrl: null,
	};

	test("una lección sin material devuelve todo en nulo", () => {
		expect(toLessonMaterial(lesson("TEXT", null))).toMatchObject({
			body: null,
			fileUrl: null,
			embed: null,
		});
	});

	test("un cuerpo válido vuelve entero", () => {
		const body = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Hola" }] },
			],
		};

		expect(
			toLessonMaterial(lesson("TEXT", { ...EMPTY_CONTENT, body })).body,
		).toEqual(body);
	});

	test("un blob que ya no encaja cae al documento vacío y no lanza", () => {
		const material = toLessonMaterial(
			lesson("TEXT", {
				...EMPTY_CONTENT,
				body: { type: "doc", content: [{ type: "iframe" }] },
			}),
		);

		expect(material.body).toEqual(EMPTY_LESSON_BODY);
	});

	test("el enlace externo llega con su embed ya resuelto", () => {
		const material = toLessonMaterial(
			lesson("LINK", {
				...EMPTY_CONTENT,
				externalUrl: "https://youtu.be/abc123",
			}),
		);

		expect(material.embed).toEqual({
			kind: "embed",
			src: "https://www.youtube-nocookie.com/embed/abc123",
		});
	});

	test("la referencia persistida sale tal cual: quien sirve la firma", () => {
		const material = toLessonMaterial(
			lesson("FILE", {
				...EMPTY_CONTENT,
				fileUrl: "/api/storage?key=documentos%2Flecciones%2Fm-1.pdf",
				fileName: "m.pdf",
				fileSize: 1024,
				mimeType: "application/pdf",
			}),
		);

		expect(material.fileUrl).toBe(
			"/api/storage?key=documentos%2Flecciones%2Fm-1.pdf",
		);
		expect(material.downloadUrl).toBeNull();
	});
});

describe("hasMaterial de un cuestionario", () => {
	const quizLesson = (questions: number) =>
		toCourseContentTree([
			{
				documentId: MODULE_A,
				title: "Práctica",
				description: null,
				order: 1,
				lessons: [
					{
						documentId: LESSON_1,
						title: "Repaso",
						type: "QUIZ",
						order: 1,
						isRequired: true,
						estimatedMinutes: null,
						content: null,
						quiz: { _count: { questions } },
					},
				],
			},
		])[0]?.lessons[0]?.hasMaterial;

	// Sus preguntas son su material: sin ellas no enseña nada.
	test("tiene material solo con preguntas", () => {
		expect(quizLesson(3)).toBe(true);
		expect(quizLesson(0)).toBe(false);
	});
});
