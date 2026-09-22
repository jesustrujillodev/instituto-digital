import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	CONTENT_MAX_LESSONS_PER_MODULE,
	CONTENT_MAX_MODULES_PER_COURSE,
	CONTENT_TITLE_MAX_LENGTH,
	LESSON_MAX_ESTIMATED_MINUTES,
} from "../content.config";
import { CONTENT_ERROR_CODES } from "../content.errors";
import {
	assertLessonLimit,
	assertModuleArchivable,
	assertModuleLimit,
	nextOrderOf,
	resolveArchiveOrder,
	resolveContentOrder,
} from "../content.rules";
import type { ReorderContentDto } from "../content.types";
import {
	validateCreateLesson,
	validateCreateModule,
	validateReorderContent,
} from "../content.validators";
import {
	LESSON_1,
	LESSON_2,
	LESSON_3,
	MODULE_A,
	MODULE_B,
	moduleOf,
	OTHER_DOC,
	treeOf,
} from "./content.fixtures";

/** El código, nunca el mensaje: el mensaje es copia traducible. */
const codeOf = (work: () => unknown): string | undefined => {
	try {
		work();
	} catch (error) {
		return isDomainError(error) ? error.code : undefined;
	}
};

const orderOf = (
	overrides: Partial<ReorderContentDto> = {},
): ReorderContentDto => ({
	modules: [MODULE_A, MODULE_B],
	lessons: [
		{ moduleDocumentId: MODULE_A, lessonDocumentIds: [LESSON_1, LESSON_2] },
		{ moduleDocumentId: MODULE_B, lessonDocumentIds: [LESSON_3] },
	],
	...overrides,
});

describe("resolveContentOrder", () => {
	test("el orden sin cambios no escribe nada", () => {
		expect(resolveContentOrder(treeOf(), orderOf())).toEqual({
			modules: [],
			lessons: [],
		});
	});

	test("intercambiar dos módulos escribe solo esos dos", () => {
		expect(
			resolveContentOrder(treeOf(), orderOf({ modules: [MODULE_B, MODULE_A] }))
				.modules,
		).toEqual([
			{ documentId: MODULE_B, order: 1 },
			{ documentId: MODULE_A, order: 2 },
		]);
	});

	test("mover una lección a otro módulo es el mismo reordenamiento", () => {
		const writes = resolveContentOrder(
			treeOf(),
			orderOf({
				lessons: [
					{ moduleDocumentId: MODULE_A, lessonDocumentIds: [LESSON_1] },
					{
						moduleDocumentId: MODULE_B,
						lessonDocumentIds: [LESSON_3, LESSON_2],
					},
				],
			}),
		);

		expect(writes.lessons).toEqual([
			{ documentId: LESSON_2, moduleDocumentId: MODULE_B, order: 2 },
		]);
	});

	test.each<[string, Partial<ReorderContentDto>]>([
		["falta un módulo", { modules: [MODULE_A] }],
		["sobra un módulo", { modules: [MODULE_A, MODULE_B, OTHER_DOC] }],
		["un módulo repetido", { modules: [MODULE_A, MODULE_A] }],
		["un módulo ajeno", { modules: [MODULE_A, OTHER_DOC] }],
		[
			"falta una lección",
			{
				lessons: [
					{ moduleDocumentId: MODULE_A, lessonDocumentIds: [LESSON_1] },
					{ moduleDocumentId: MODULE_B, lessonDocumentIds: [LESSON_3] },
				],
			},
		],
		[
			"una lección repetida",
			{
				lessons: [
					{
						moduleDocumentId: MODULE_A,
						lessonDocumentIds: [LESSON_1, LESSON_1],
					},
					{ moduleDocumentId: MODULE_B, lessonDocumentIds: [LESSON_3] },
				],
			},
		],
		[
			"una lección ajena",
			{
				lessons: [
					{
						moduleDocumentId: MODULE_A,
						lessonDocumentIds: [LESSON_1, LESSON_2],
					},
					{ moduleDocumentId: MODULE_B, lessonDocumentIds: [OTHER_DOC] },
				],
			},
		],
	])("%s no es una permutación", (_case, overrides) => {
		expect(
			codeOf(() => resolveContentOrder(treeOf(), orderOf(overrides))),
		).toBe(CONTENT_ERROR_CODES.INVALID_ORDER);
	});

	test("un orden con huecos sale normalizado desde 1", () => {
		const tree = [
			moduleOf({ order: 3, lessons: [] }),
			moduleOf({ documentId: MODULE_B, order: 7, lessons: [] }),
		];

		expect(
			resolveContentOrder(tree, {
				modules: [MODULE_A, MODULE_B],
				lessons: [
					{ moduleDocumentId: MODULE_A, lessonDocumentIds: [] },
					{ moduleDocumentId: MODULE_B, lessonDocumentIds: [] },
				],
			}).modules,
		).toEqual([
			{ documentId: MODULE_A, order: 1 },
			{ documentId: MODULE_B, order: 2 },
		]);
	});
});

describe("resolveArchiveOrder", () => {
	const siblings = [
		{ documentId: MODULE_A, order: 1 },
		{ documentId: MODULE_B, order: 2 },
		{ documentId: OTHER_DOC, order: 3 },
	];

	test("archivar el del medio re-empaqueta a los de atrás", () => {
		expect(resolveArchiveOrder(MODULE_B, siblings)).toEqual([
			{ documentId: OTHER_DOC, order: 2 },
		]);
	});

	test("archivar el último no mueve a nadie", () => {
		expect(resolveArchiveOrder(OTHER_DOC, siblings)).toEqual([]);
	});
});

describe("nextOrderOf", () => {
	test("la fila nueva va al final", () => {
		expect(nextOrderOf([])).toBe(1);
		expect(nextOrderOf([{ documentId: MODULE_A, order: 1 }])).toBe(2);
	});
});

describe("límites", () => {
	test("en el tope no entra uno más", () => {
		expect(
			codeOf(() => assertModuleLimit(CONTENT_MAX_MODULES_PER_COURSE)),
		).toBe(CONTENT_ERROR_CODES.TOO_MANY_MODULES);
		expect(
			codeOf(() => assertLessonLimit(CONTENT_MAX_LESSONS_PER_MODULE)),
		).toBe(CONTENT_ERROR_CODES.TOO_MANY_LESSONS);
	});

	test("uno por debajo del tope sí entra", () => {
		expect(() =>
			assertModuleLimit(CONTENT_MAX_MODULES_PER_COURSE - 1),
		).not.toThrow();
		expect(() =>
			assertLessonLimit(CONTENT_MAX_LESSONS_PER_MODULE - 1),
		).not.toThrow();
	});
});

describe("assertModuleArchivable", () => {
	test("con lecciones activas no se archiva", () => {
		expect(codeOf(() => assertModuleArchivable(2))).toBe(
			CONTENT_ERROR_CODES.MODULE_NOT_EMPTY,
		);
	});

	test("vacío sí", () => {
		expect(() => assertModuleArchivable(0)).not.toThrow();
	});
});

describe("validadores", () => {
	test("la descripción vacía se normaliza a null", () => {
		expect(validateCreateModule({ title: "Fundamentos" })).toEqual({
			title: "Fundamentos",
			description: null,
		});
	});

	test("el título del módulo tiene tope", () => {
		const title = (length: number) => ({ title: "x".repeat(length) });

		expect(() =>
			validateCreateModule(title(CONTENT_TITLE_MAX_LENGTH)),
		).not.toThrow();
		expect(() =>
			validateCreateModule(title(CONTENT_TITLE_MAX_LENGTH + 1)),
		).toThrow();
	});

	test("la lección nace obligatoria y sin minutos", () => {
		expect(
			validateCreateLesson({
				moduleDocumentId: MODULE_A,
				title: "Marco legal",
				type: "TEXT",
			}),
		).toEqual({
			moduleDocumentId: MODULE_A,
			title: "Marco legal",
			type: "TEXT",
			isRequired: true,
			estimatedMinutes: null,
		});
	});

	test("un tipo fuera de la picklist se rechaza", () => {
		expect(() =>
			validateCreateLesson({
				moduleDocumentId: MODULE_A,
				title: "Video",
				type: "VIDEO",
			}),
		).toThrow();
	});

	test("los minutos estimados tienen rango", () => {
		const lesson = (estimatedMinutes: number) => ({
			moduleDocumentId: MODULE_A,
			title: "Marco legal",
			type: "TEXT" as const,
			estimatedMinutes,
		});

		expect(() => validateCreateLesson(lesson(0))).toThrow();
		expect(() =>
			validateCreateLesson(lesson(LESSON_MAX_ESTIMATED_MINUTES + 1)),
		).toThrow();
		expect(() => validateCreateLesson(lesson(45))).not.toThrow();
	});

	test("el reordenamiento exige identificadores válidos", () => {
		expect(() =>
			validateReorderContent({ modules: ["no-es-uuid"], lessons: [] }),
		).toThrow();
	});
});
