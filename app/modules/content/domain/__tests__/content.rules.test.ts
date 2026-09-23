import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	CONTENT_MAX_LESSONS_PER_MODULE,
	CONTENT_MAX_MODULES_PER_COURSE,
	CONTENT_TITLE_MAX_LENGTH,
	LESSON_FILE,
	LESSON_MATERIAL_PREFIX,
	LESSON_MAX_ESTIMATED_MINUTES,
	LESSON_VIDEO,
} from "../content.config";
import {
	CONTENT_ERROR_CODES,
	type ContentMaterialMismatchError,
	ContentUploadInvalidError,
	type ContentUploadNotFoundError,
	type ContentUploadTooLargeError,
} from "../content.errors";
import {
	assertLessonLimit,
	assertMaterialMatchesLesson,
	assertModuleArchivable,
	assertModuleLimit,
	assertUploadAllowed,
	lessonBodyRule,
	nextOrderOf,
	requireUploadedObject,
	resolveArchiveOrder,
	resolveContentOrder,
	resolveEmbed,
	toPlainText,
} from "../content.rules";
import type { ReorderContentDto } from "../content.types";
import {
	validateCreateLesson,
	validateCreateModule,
	validateReorderContent,
	validateSaveMaterial,
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
				title: "Presentación",
				type: "SLIDES",
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

describe("el cuerpo de una lección de texto", () => {
	const doc = (content: unknown[]) => ({ type: "doc", content });

	test("un documento con lo que el editor produce se acepta", () => {
		const body = doc([
			{
				type: "heading",
				attrs: { level: 2 },
				content: [{ type: "text", text: "Objetivo" }],
			},
			{
				type: "paragraph",
				content: [
					{ type: "text", text: "Al terminar " },
					{ type: "text", marks: [{ type: "bold" }], text: "sabrás" },
					{ type: "hardBreak" },
					{
						type: "text",
						marks: [{ type: "link", attrs: { href: "https://gob.mx" } }],
						text: "el reglamento",
					},
				],
			},
			{
				type: "bulletList",
				content: [
					{
						type: "listItem",
						content: [
							{ type: "paragraph", content: [{ type: "text", text: "Uno" }] },
						],
					},
				],
			},
		]);

		expect(v.parse(lessonBodyRule, body)).toEqual(body);
	});

	test("un nodo desconocido se rechaza, no se ignora", () => {
		expect(() =>
			v.parse(lessonBodyRule, doc([{ type: "iframe", src: "https://x.mx" }])),
		).toThrow();
	});

	test("un enlace javascript: no se puede guardar", () => {
		const body = doc([
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
						text: "pulsa",
					},
				],
			},
		]);

		expect(() => v.parse(lessonBodyRule, body)).toThrow();
	});

	test("un atributo que el editor añade y el renderizador ignora se descarta", () => {
		const body = doc([
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						marks: [
							{
								type: "link",
								attrs: {
									href: "https://gob.mx",
									target: "_blank",
									class: "x",
								},
							},
						],
						text: "enlace",
					},
				],
			},
		]);

		const parsed = v.parse(lessonBodyRule, body);
		const [paragraph] = parsed.content;
		const mark =
			paragraph.type === "paragraph" && paragraph.content?.[0].type === "text"
				? paragraph.content[0].marks?.[0]
				: null;

		expect(mark).toEqual({ type: "link", attrs: { href: "https://gob.mx" } });
	});

	test("un documento con demasiados niveles se rechaza sin agotar la pila", () => {
		let node: unknown = {
			type: "paragraph",
			content: [{ type: "text", text: "hondo" }],
		};
		for (let level = 0; level < 12; level += 1) {
			node = { type: "blockquote", content: [node] };
		}

		expect(() => v.parse(lessonBodyRule, doc([node]))).toThrow();
	});

	test("toPlainText devuelve el texto desnudo", () => {
		const body = v.parse(
			lessonBodyRule,
			doc([
				{
					type: "heading",
					attrs: { level: 2 },
					content: [{ type: "text", text: "Objetivo" }],
				},
				{
					type: "bulletList",
					content: [
						{
							type: "listItem",
							content: [
								{
									type: "paragraph",
									content: [{ type: "text", text: "Uno" }],
								},
							],
						},
					],
				},
				{ type: "horizontalRule" },
			]),
		);

		expect(toPlainText(body)).toBe("Objetivo\nUno");
	});
});

describe("el material subido", () => {
	const KEY = `${LESSON_MATERIAL_PREFIX}/manual-1700000000.pdf`;

	test("cada clase de material exige lo suyo", () => {
		expect(
			validateSaveMaterial({
				lessonDocumentId: LESSON_1,
				type: "FILE",
				key: KEY,
				fileName: "manual.pdf",
				mimeType: "application/pdf",
			}),
		).toMatchObject({ type: "FILE", key: KEY });

		expect(
			validateSaveMaterial({
				lessonDocumentId: LESSON_1,
				type: "LINK",
				externalUrl: "https://gob.mx/manual",
			}),
		).toMatchObject({ type: "LINK" });
	});

	test("un material incoherente con su clase no llega a ser DTO", () => {
		expect(() =>
			validateSaveMaterial({ lessonDocumentId: LESSON_1, type: "FILE" }),
		).toThrow();

		expect(() =>
			validateSaveMaterial({
				lessonDocumentId: LESSON_1,
				type: "LINK",
				externalUrl: "javascript:alert(1)",
			}),
		).toThrow();
	});

	test("una key de fuera del prefijo del módulo se rechaza", () => {
		expect(() =>
			validateSaveMaterial({
				lessonDocumentId: LESSON_1,
				type: "FILE",
				key: "documentos/nominas/secreto-1700000000.pdf",
				fileName: "secreto.pdf",
				mimeType: "application/pdf",
			}),
		).toThrow();
	});

	test("el tipo y el tamaño se comprueban antes de firmar", () => {
		const video = { name: "clase.mp4", type: "video/mp4", size: 10 };

		expect(() => assertUploadAllowed("VIDEO", video)).not.toThrow();
		expect(() =>
			assertUploadAllowed("FILE", { ...video, name: "clase.mp4" }),
		).toThrow(ContentUploadInvalidError);
		expect(() =>
			assertUploadAllowed("VIDEO", {
				...video,
				size: LESSON_VIDEO.maxBytes + 1,
			}),
		).toThrow(ContentUploadInvalidError);
	});

	test("un objeto que nunca llegó al bucket se rechaza por su código", () => {
		try {
			requireUploadedObject("FILE", null);
			expect.unreachable("debió lanzar");
		} catch (error) {
			expect((error as ContentUploadNotFoundError).code).toBe(
				CONTENT_ERROR_CODES.UPLOAD_NOT_FOUND,
			);
		}
	});

	test("el tope que la firma no impone se impone al confirmar", () => {
		try {
			requireUploadedObject("FILE", { size: LESSON_FILE.maxBytes + 1 });
			expect.unreachable("debió lanzar");
		} catch (error) {
			const typed = error as ContentUploadTooLargeError;
			expect(typed.code).toBe(CONTENT_ERROR_CODES.UPLOAD_TOO_LARGE);
			expect(typed.details.limit).toBe(LESSON_FILE.maxBytes);
		}
	});

	test("el material tiene que ser de la clase de su lección", () => {
		expect(() => assertMaterialMatchesLesson("TEXT", "TEXT")).not.toThrow();
		try {
			assertMaterialMatchesLesson("TEXT", "VIDEO");
			expect.unreachable("debió lanzar");
		} catch (error) {
			expect((error as ContentMaterialMismatchError).code).toBe(
				CONTENT_ERROR_CODES.MATERIAL_MISMATCH,
			);
		}
	});
});

describe("resolveEmbed", () => {
	test("reconoce los tres proveedores", () => {
		expect(resolveEmbed("https://www.youtube.com/watch?v=abc123")).toEqual({
			kind: "embed",
			src: "https://www.youtube-nocookie.com/embed/abc123",
		});
		expect(resolveEmbed("https://youtu.be/abc123")).toEqual({
			kind: "embed",
			src: "https://www.youtube-nocookie.com/embed/abc123",
		});
		expect(resolveEmbed("https://vimeo.com/76979871")).toEqual({
			kind: "embed",
			src: "https://player.vimeo.com/video/76979871",
		});
		expect(resolveEmbed("https://drive.google.com/file/d/XYZ/view")).toEqual({
			kind: "embed",
			src: "https://drive.google.com/file/d/XYZ/preview",
		});
	});

	test("un proveedor desconocido se enseña como enlace, no rompe", () => {
		expect(resolveEmbed("https://transparencia.gob.mx/manual")).toEqual({
			kind: "link",
			href: "https://transparencia.gob.mx/manual",
		});
	});

	test("lo que no es http(s) tampoco se incrusta", () => {
		expect(resolveEmbed("javascript:alert(1)")).toEqual({
			kind: "link",
			href: "javascript:alert(1)",
		});
		expect(resolveEmbed("no es una url")).toMatchObject({ kind: "link" });
	});
});
